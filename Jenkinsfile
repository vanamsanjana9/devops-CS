pipeline {
    agent {
        docker {
            image 'node:18-bullseye'
            args '--shm-size=2gb -u root'
        }
    }
    
    environment {
        // Use Jenkins Credentials ID for your Docker Hub or container registry
        DOCKER_CREDENTIALS_ID = 'your-dockerhub-credentials-id'
        IMAGE_NAME = 'your-dockerhub-username/taskflow-backend'
        KUBE_NAMESPACE = 'default'
    }

    stages {
        stage('Install Dependencies') {
            steps {
                dir('Taskflow/backend') {
                    sh 'npm ci'
                }
            }
        }
        
        stage('Run Unit & Integration Tests') {
            steps {
                dir('Taskflow/backend') {
                    sh 'npm test'
                }
            }
        }

        stage('Build & Push Docker Image') {
            steps {
                script {
                    // Log in to Docker Registry using Jenkins credentials
                    docker.withRegistry('https://index.docker.io/v1/', "${env.DOCKER_CREDENTIALS_ID}") {
                        // Build the Docker image using the Dockerfile in the backend folder
                        app = docker.build("${env.IMAGE_NAME}:${env.BUILD_NUMBER}")
                        // Push the image tagged with the specific Jenkins build number
                        app.push("${env.BUILD_NUMBER}")
                        // Also push/update the 'latest' tag
                        app.push('latest')
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    // Ensure your Jenkins agent has kubectl installed and configured with your cluster context
                    echo "Deploying version ${env.BUILD_NUMBER} to Kubernetes..."
                    
                    // Option A: Update the image tag dynamically in your existing deployment manifest
                    sh "sed -i 's|image:.*|image: ${env.IMAGE_NAME}:${env.BUILD_NUMBER}|g' k8s/backend.yaml"
                    
                    // Option B: Apply the Kubernetes manifests
                    sh "kubectl apply -f k8s/mongo.yaml -n ${env.KUBE_NAMESPACE}"
                    sh "kubectl apply -f k8s/backend.yaml -n ${env.KUBE_NAMESPACE}"
                    sh "kubectl apply -f k8s/selenium.yaml -n ${env.KUBE_NAMESPACE}"
                    
                    // Verify rollout success
                    sh "kubectl rollout status deployment/backend-deployment -n ${env.KUBE_NAMESPACE}"
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline completed successfully! Taskflow backend is deployed."
        }
        failure {
            echo "Pipeline failed during execution. Check logs above."
        }
        always {
            cleanWs()
        }
    }
}
