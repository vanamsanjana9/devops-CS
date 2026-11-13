pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                echo "Running tests"
                bat 'pip install -r requirements.txt'
                
                // Start app in background and redirect output to a log file for debugging
                bat 'start /B python app.py > app.log 2>&1'
                
                // Wait for the server to boot up
                bat 'ping 127.0.0.1 -n 5 > nul'
                
                // Run pytest inside a try/finally block to guarantee cleanup
                script {
                    try {
                        bat 'python -m pytest -v'
                    } finally {
                        // Force terminate the background python process so ports/files are released
                        bat 'taskkill /f /im python.exe || exit 0'
                    }
                }
            }
        }

        stage('Build') {
            steps {
                echo "Building Docker Image"
                bat 'docker build -t kubedemoapp:v1 .'
            }
        }

        stage('Docker Login') {
            steps {
                echo "Docker Login"
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    bat 'echo %DOCKERHUB_TOKEN% | docker login -u %DOCKERHUB_USER% --password-stdin'
                }
            }
        }

        stage('Push Docker Image') {
            steps {
                echo "Pushing Docker Image"
                bat 'docker tag kubedemoapp:v1 vanamsanjana9/sample:seleniumtest'
                bat 'docker push vanamsanjana9/sample:seleniumtest'
            }
        }

        stage('Deploy') {
            steps {
                bat 'kubectl apply -f deployment.yaml --validate=false'
                bat 'kubectl apply -f service.yaml'
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed'
        }
        always {
            // Safety net: ensure no lingering python process blocks future builds
            bat 'taskkill /f /im python.exe || exit 0'
        }
    }
}
