const zlib = require('zlib');
const User = require('../models/User');
const {
  addProject,
  addProjectTeam,
  getTeams,
  persistDashboardState,
  syncUserAccount,
  validateProjectTeam
} = require('../data/mockData');

const MAX_PDF_SIZE = 5 * 1024 * 1024;
const MAX_EXCEL_SIZE = 5 * 1024 * 1024;
const MAX_PROJECTS_PER_WORKBOOK = 100;
const MAX_UNCOMPRESSED_SIZE = 20 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function invalidProjectDetails(message) {
  const error = new Error(message);
  error.status = 422;
  return error;
}

function getLabeledValue(text, labelPattern) {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function readPdfString(source, start) {
  if (source[start] === '(') {
    let depth = 1;
    let value = '';
    let index = start + 1;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '\\') {
        index += 1;
        if (index >= source.length) break;
        const escaped = source[index];
        const escapedCharacters = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
        if (Object.prototype.hasOwnProperty.call(escapedCharacters, escaped)) {
          value += escapedCharacters[escaped];
        } else if (escaped === '\r' || escaped === '\n') {
          if (escaped === '\r' && source[index + 1] === '\n') index += 1;
        } else if (/[0-7]/.test(escaped)) {
          let octal = escaped;
          while (octal.length < 3 && /[0-7]/.test(source[index + 1] || '')) {
            octal += source[++index];
          }
          value += String.fromCharCode(parseInt(octal, 8));
        } else {
          value += escaped;
        }
      } else if (character === '(') {
        depth += 1;
        value += character;
      } else if (character === ')') {
        depth -= 1;
        if (depth > 0) value += character;
      } else {
        value += character;
      }
      index += 1;
    }
    return { value, end: index };
  }

  if (source[start] === '<' && source[start + 1] !== '<') {
    const end = source.indexOf('>', start + 1);
    if (end === -1) return null;
    return { hex: source.slice(start + 1, end).replace(/\s/g, ''), end: end + 1 };
  }
  return null;
}

function decodeUnicodeHex(hex) {
  const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const bigEndian = bytes.subarray(2);
    const littleEndian = Buffer.alloc(bigEndian.length);
    for (let index = 0; index + 1 < bigEndian.length; index += 2) {
      littleEndian[index] = bigEndian[index + 1];
      littleEndian[index + 1] = bigEndian[index];
    }
    return littleEndian.toString('utf16le');
  }
  return bytes.toString('latin1');
}

function decodeCMapTarget(hex) {
  const bytes = Buffer.from(hex, 'hex');
  const start = bytes[0] === 0xfe && bytes[1] === 0xff ? 2 : 0;
  const bigEndian = bytes.subarray(start);
  const littleEndian = Buffer.alloc(bigEndian.length);
  for (let index = 0; index + 1 < bigEndian.length; index += 2) {
    littleEndian[index] = bigEndian[index + 1];
    littleEndian[index + 1] = bigEndian[index];
  }
  return littleEndian.toString('utf16le');
}

function collectToUnicodeMappings(streams) {
  const mappings = new Map();
  streams.forEach((stream) => {
    if (!/beginbf(?:char|range)/.test(stream)) return;

    for (const block of stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
        mappings.set(pair[1].toUpperCase(), decodeCMapTarget(pair[2]));
      }
    }

    for (const block of stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const range of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]*)\])/gi)) {
        const first = parseInt(range[1], 16);
        const last = parseInt(range[2], 16);
        const width = range[1].length;
        if (last - first > 1000) continue;

        if (range[5] !== undefined) {
          const destinations = [...range[5].matchAll(/<([0-9a-f]+)>/gi)];
          for (let offset = 0; offset <= last - first && offset < destinations.length; offset += 1) {
            mappings.set((first + offset).toString(16).padStart(width, '0').toUpperCase(), decodeCMapTarget(destinations[offset][1]));
          }
        } else {
          const destination = parseInt(range[4], 16);
          const destinationWidth = range[4].length;
          for (let offset = 0; offset <= last - first; offset += 1) {
            const code = (first + offset).toString(16).padStart(width, '0').toUpperCase();
            const unicode = (destination + offset).toString(16).padStart(destinationWidth, '0');
            mappings.set(code, decodeCMapTarget(unicode));
          }
        }
      }
    }
  });
  return mappings;
}

function decodePdfHex(hex, mappings) {
  if (mappings.size) {
    const widths = [...new Set([...mappings.keys()].map((code) => code.length))].sort((left, right) => right - left);
    let output = '';
    const normalized = hex.toUpperCase();
    for (let index = 0; index < normalized.length;) {
      const width = widths.find((candidate) => mappings.has(normalized.slice(index, index + candidate)));
      if (!width) {
        output += decodeUnicodeHex(normalized.slice(index, index + 2));
        index += 2;
      } else {
        output += mappings.get(normalized.slice(index, index + width));
        index += width;
      }
    }
    return output;
  }
  return decodeUnicodeHex(hex);
}

function extractPdfText(pdf) {
  const source = pdf.toString('latin1');
  const streams = [];
  let searchFrom = 0;
  while (true) {
    const streamStart = source.indexOf('stream', searchFrom);
    if (streamStart === -1) break;
    let dataStart = streamStart + 6;
    if (source[dataStart] === '\r' && source[dataStart + 1] === '\n') dataStart += 2;
    else if (source[dataStart] === '\n' || source[dataStart] === '\r') dataStart += 1;
    const streamEnd = source.indexOf('endstream', dataStart);
    if (streamEnd === -1) break;
    const dictionaryStart = source.lastIndexOf('<<', streamStart);
    const dictionary = dictionaryStart === -1 ? '' : source.slice(dictionaryStart, streamStart);
    const encoded = pdf.subarray(dataStart, streamEnd);
    try {
      const decoded = /\/FlateDecode\b/.test(dictionary)
        ? zlib.inflateSync(encoded)
        : encoded;
      streams.push(decoded.toString('latin1'));
    } catch (error) {
      if (/\/FlateDecode\b/.test(dictionary)) {
        searchFrom = streamEnd + 9;
        continue;
      }
      throw error;
    }
    searchFrom = streamEnd + 9;
  }

  const mappings = collectToUnicodeMappings(streams);
  const extracted = [];
  streams.forEach((stream) => {
    const tokens = [];
    for (let index = 0; index < stream.length;) {
      if (stream[index] === '(' || (stream[index] === '<' && stream[index + 1] !== '<')) {
        const token = readPdfString(stream, index);
        if (token) {
          tokens.push({ ...token, start: index });
          index = token.end;
          continue;
        }
      }
      index += 1;
    }

    let previousTextEnd = 0;
    tokens.forEach((token) => {
      let next = token.end;
      while (/\s/.test(stream[next] || '')) next += 1;
      let isText = stream.startsWith('Tj', next) || stream[next] === "'" || stream[next] === '"';
      if (!isText) {
        const arrayStart = stream.lastIndexOf('[', token.start);
        const arrayEnd = stream.indexOf(']', token.end);
        if (arrayStart !== -1 && arrayEnd !== -1) {
          let afterArray = arrayEnd + 1;
          while (/\s/.test(stream[afterArray] || '')) afterArray += 1;
          if (stream.startsWith('TJ', afterArray) && !stream.slice(token.end, arrayEnd).includes(']')) {
            isText = true;
          }
        }
      }
      if (!isText) return;

      const separator = /(?:T\*|[-+]?(?:\d*\.)?\d+\s+T[dD]|(?:[-+]?(?:\d*\.)?\d+\s+){6}Tm)/.test(stream.slice(previousTextEnd, token.start))
        ? '\n'
        : ' ';
      extracted.push(`${separator}${token.hex !== undefined ? decodePdfHex(token.hex, mappings) : token.value}`);
      previousTextEnd = token.end;
    });
  });

  const text = extracted.join('').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  if (!text.trim()) {
    throw new Error('PDF has no extractable text.');
  }
  return text;
}

function parseProjectDetails(text) {
  const normalizedText = text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  const name = getLabeledValue(normalizedText, '(?:project\\s+)?(?:title|name)');
  const descriptionMatch = normalizedText.match(
    /(?:^|\n)\s*(?:project\s+)?(?:description|objective|project\s+goal)\s*[:\-]\s*([\s\S]*?)(?=\n\s*(?:faculty\s+)?guide(?:\s+name|\s+email)?\s*[:\-]|\n\s*students?\s*[:\-]|$)/i
  );
  const description = descriptionMatch
    ? descriptionMatch[1].split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
    : 'Project imported from PDF.';

  const guideName = getLabeledValue(normalizedText, '(?:faculty\\s+)?guide\\s+name');
  const guideEmail = getLabeledValue(normalizedText, '(?:faculty\\s+)?guide\\s+email');
  const students = [1, 2, 3].map((number) => ({
    name: getLabeledValue(normalizedText, `student\\s*${number}\\s+name`),
    email: getLabeledValue(normalizedText, `student\\s*${number}\\s+email`)
  }));

  return {
    name,
    description,
    guide: { name: guideName, email: guideEmail },
    students
  };
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readZipEntries(buffer) {
  const minimumEndOffset = Math.max(0, buffer.length - 22 - 0xffff);
  let endRecordOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEndOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset === -1) throw new Error('Invalid Excel workbook archive.');

  const entryCount = buffer.readUInt16LE(endRecordOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endRecordOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  let uncompressedTotal = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid Excel workbook archive.');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_UNCOMPRESSED_SIZE) {
      throw new Error('Excel workbook contents exceed the allowed size.');
    }

    if (!fileName.endsWith('/')) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error('Invalid Excel workbook archive.');
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
      let data;
      if (method === 0) data = compressedData;
      else if (method === 8) data = zlib.inflateRawSync(compressedData, { maxOutputLength: MAX_UNCOMPRESSED_SIZE });
      else throw new Error('This Excel workbook uses an unsupported compression method.');
      if (data.length !== uncompressedSize) throw new Error('Excel workbook entry has an invalid size.');
      entries.set(fileName, data.toString('utf8'));
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseWorkbookCellReference(reference) {
  const columnLetters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
  if (!columnLetters) return -1;
  return [...columnLetters].reduce((column, letter) => column * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseExcelProjects(buffer) {
  const entries = readZipEntries(buffer);
  const workbook = entries.get('xl/workbook.xml');
  const relationshipId = workbook?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const relationships = entries.get('xl/_rels/workbook.xml.rels') || '';
  const worksheetTarget = relationshipId && [...relationships.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((match) => ({
      id: match[1].match(/\bId="([^"]+)"/)?.[1],
      target: match[1].match(/\bTarget="([^"]+)"/)?.[1]
    }))
    .find((relation) => relation.id === relationshipId)?.target;
  const worksheetPath = worksheetTarget
    ? `xl/${worksheetTarget.replace(/^\/?xl\//, '').replace(/^\//, '')}`
    : 'xl/worksheets/sheet1.xml';
  const worksheet = entries.get(worksheetPath);
  if (!workbook || !worksheet) throw invalidProjectDetails('The Excel file does not contain a readable first worksheet.');

  const sharedStrings = (entries.get('xl/sharedStrings.xml') || '').match(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g) || [];
  const sharedValues = sharedStrings.map((item) =>
    [...item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join('')
  );

  const rows = [...worksheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)]
    .map((row, index) => {
      const values = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const reference = cell[1].match(/\br="([^"]+)"/)?.[1];
        const column = parseWorkbookCellReference(reference || '');
        if (column < 0) continue;
        const type = cell[1].match(/\bt="([^"]+)"/)?.[1];
        const value = cell[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
        const inlineValue = [...cell[2].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((match) => decodeXml(match[1])).join('');
        values[column] = type === 's'
          ? sharedValues[Number(value)] || ''
          : type === 'inlineStr'
            ? inlineValue
            : value === undefined ? '' : decodeXml(value);
      }
      const rowNumber = Number(row[0].match(/\br="(\d+)"/)?.[1]) || index + 1;
      return { values, rowNumber };
    })
    .filter((row) => row.values.some((value) => String(value || '').trim()));

  if (rows.length < 2) {
    throw invalidProjectDetails('The Excel sheet must have a header row and at least one project row.');
  }
  if (rows.length - 1 > MAX_PROJECTS_PER_WORKBOOK) {
    throw invalidProjectDetails(`Upload no more than ${MAX_PROJECTS_PER_WORKBOOK} projects per Excel workbook.`);
  }

  const headerNames = new Map([
    ['projecttitle', 'name'],
    ['title', 'name'],
    ['projectname', 'name'],
    ['description', 'description'],
    ['projectdescription', 'description'],
    ['guidename', 'guideName'],
    ['facultyguidename', 'guideName'],
    ['guideemail', 'guideEmail'],
    ['facultyguideemail', 'guideEmail'],
    ['student1name', 'student1Name'],
    ['student1email', 'student1Email'],
    ['student2name', 'student2Name'],
    ['student2email', 'student2Email'],
    ['student3name', 'student3Name'],
    ['student3email', 'student3Email']
  ]);
  const normalizeHeader = (header) => String(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const headers = rows[0].values.map((header) => headerNames.get(normalizeHeader(header)) || '');
  const requiredHeaders = [
    'name',
    'description',
    'guideName',
    'guideEmail',
    'student1Name',
    'student1Email',
    'student2Name',
    'student2Email',
    'student3Name',
    'student3Email'
  ];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw invalidProjectDetails('The first worksheet is missing one or more required column headers. Use the provided project template.');
  }

  return rows.slice(1).map((row) => {
    const values = Object.fromEntries(headers.map((header, column) => [
      header,
      String(row.values[column] || '').trim()
    ]));
    return {
      rowNumber: row.rowNumber,
      name: values.name || '',
      description: values.description || 'Project imported from Excel.',
      guide: { name: values.guideName || '', email: values.guideEmail || '' },
      students: [1, 2, 3].map((number) => ({
        name: values[`student${number}Name`] || '',
        email: values[`student${number}Email`] || ''
      }))
    };
  });
}

function validateExtractedProject(details) {
  const name = details.name.trim();
  const description = details.description.trim();
  const members = [
    { ...details.guide, role: 'Guide' },
    ...details.students.map((student) => ({ ...student, role: 'Student' }))
  ].map((member) => ({
    name: member.name.trim(),
    email: member.email.trim().toLowerCase(),
    role: member.role
  }));

  if (!name || name.length > 120) {
    throw invalidProjectDetails('The file must include a project title of up to 120 characters.');
  }
  if (!description || description.length > 1000) {
    throw invalidProjectDetails('The project description is required and must be 1,000 characters or fewer.');
  }
  if (members.some((member) =>
    !member.name || member.name.length > 120 || !EMAIL_PATTERN.test(member.email) || member.email.length > 254
  )) {
    throw invalidProjectDetails('The file must include a valid name and email address for the guide and all three students.');
  }
  if (new Set(members.map((member) => member.email)).size !== members.length) {
    throw invalidProjectDetails('The guide and each student must have a different email address.');
  }

  return {
    name,
    description,
    guide: members[0],
    students: members.slice(1)
  };
}

async function createProjectFromPdf(req, res, next) {
  try {
    const file = req.body;
    if (!Buffer.isBuffer(file) || file.length === 0) {
      return res.status(400).json({ message: 'Upload an Excel workbook or PDF containing project and assigned member details.' });
    }
    let projectDetails;
    if (req.is(EXCEL_CONTENT_TYPE)) {
      if (file.length > MAX_EXCEL_SIZE) {
        return res.status(413).json({ message: 'The Excel workbook must be 5 MB or smaller.' });
      }
      if (file[0] !== 0x50 || file[1] !== 0x4b) {
        return res.status(415).json({ message: 'The uploaded file is not a valid .xlsx workbook.' });
      }
      try {
        projectDetails = parseExcelProjects(file);
      } catch (error) {
        if (error.status) throw error;
        throw invalidProjectDetails(error.message || 'Could not read this Excel workbook.');
      }
    } else {
      if (file.length > MAX_PDF_SIZE) {
        return res.status(413).json({ message: 'The PDF must be 5 MB or smaller.' });
      }
      if (!file.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
        return res.status(415).json({ message: 'The uploaded file is not a valid PDF.' });
      }

      let text;
      try {
        text = extractPdfText(file);
      } catch (error) {
        throw invalidProjectDetails(error.message === 'PDF has no extractable text.'
          ? 'This PDF has no selectable text. Upload a searchable PDF rather than a scanned image.'
          : 'Could not read this PDF. Upload a searchable PDF with selectable text.');
      }
      projectDetails = [parseProjectDetails(text)];
    }

    const detailsList = projectDetails.map((details) => {
      try {
        return validateExtractedProject(details);
      } catch (error) {
        if (error.status && details.rowNumber) {
          error.message = `Excel row ${details.rowNumber}: ${error.message}`;
        }
        throw error;
      }
    });
    const accountMembers = new Map();
    const accountMemberRows = new Map();
    const assignedStudentEmailsInFile = new Set();
    detailsList.forEach((details, index) => {
      const rowNumber = details.rowNumber || index + 2;
      for (const member of [details.guide, ...details.students]) {
        const previous = accountMembers.get(member.email);
        if (previous && (previous.role !== member.role || previous.name.toLowerCase() !== member.name.toLowerCase())) {
          const previousRow = accountMemberRows.get(member.email);
          throw invalidProjectDetails(
            `Excel row ${rowNumber}: ${member.email} is listed as ${previous.role} "${previous.name}" in row ${previousRow}, ` +
            `but as ${member.role} "${member.name}" in this row. Use the same name and role for each email address.`
          );
        }
        accountMembers.set(member.email, member);
        accountMemberRows.set(member.email, rowNumber);
      }
      for (const student of details.students) {
        if (assignedStudentEmailsInFile.has(student.email)) {
          throw invalidProjectDetails(`${student.email} is assigned more than once in this workbook; each student can only be assigned to one project.`);
        }
        assignedStudentEmailsInFile.add(student.email);
      }
    });

    const existingUsers = await User.find({
      email: { $in: [...accountMembers.keys()] }
    });
    const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));

    for (const member of accountMembers.values()) {
      const existingUser = usersByEmail.get(member.email);
      if (existingUser && existingUser.role !== member.role) {
        return res.status(409).json({
          message: `${member.email} is already registered with the ${existingUser.role} role, not ${member.role}.`
        });
      }
    }

    const assignedStudents = new Set(getTeams().flatMap((team) =>
      team.studentEmails.map((email) => email.toLowerCase())
    ));
    const alreadyAssigned = [...assignedStudentEmailsInFile].find((email) => assignedStudents.has(email));
    if (alreadyAssigned) {
      return res.status(409).json({
        message: `${alreadyAssigned} is already assigned to another project team.`
      });
    }

    const missingMembers = [...accountMembers.values()].filter((member) => !usersByEmail.has(member.email));
    const createdUsers = await User.create(missingMembers.map((member) => ({
      name: member.name,
      email: member.email,
      password: member.role === 'Guide' ? 'guide123' : 'student123',
      role: member.role
    })));

    createdUsers.forEach((user) => syncUserAccount({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role
    }));

    const projects = [];
    for (const details of detailsList) {
      const assignmentError = validateProjectTeam({
        guideEmail: details.guide.email,
        studentEmails: details.students.map((student) => student.email)
      });
      if (assignmentError) {
        return res.status(409).json({ message: assignmentError });
      }

      const project = addProject({ name: details.name, description: details.description });
      const assignment = addProjectTeam({
        projectId: project.id,
        guideEmail: details.guide.email,
        studentEmails: details.students.map((student) => student.email)
      });
      if (assignment.error) {
        return res.status(409).json({ message: assignment.error });
      }
      projects.push({
        ...project,
        teams: [assignment.team]
      });
    }

    await persistDashboardState();

    return res.status(201).json({
      message: `${projects.length} project(s) imported and assigned successfully.`,
      projects,
      project: projects[0],
      createdUsers: createdUsers.map((user) => ({
        name: user.name,
        email: user.email,
        role: user.role
      }))
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

module.exports = { createProjectFromPdf };
