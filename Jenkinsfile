pipeline {
    agent any

    stages {
        stage('Test') {
            steps {
                echo "Running Taskflow backend tests"
                dir('Taskflow/backend') {
                    bat 'npm ci'
                    bat 'npm test'
                }
            }
        }

        stage('Build') {
            steps {
                echo "Building Taskflow Docker Image"
                // Builds using the Dockerfile inside Taskflow/backend
                bat 'docker build -t taskflow-backend:v1 ./Taskflow/backend'
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
                echo "Pushing Taskflow Docker Image"
                bat 'docker tag taskflow-backend:v1 vanamsanjana9/taskflow-backend:latest'
                bat 'docker push vanamsanjana9/taskflow-backend:latest'
            }
        }

        stage('Deploy') {
            steps {
                echo "Deploying Taskflow to Kubernetes"
                bat 'kubectl apply -f k8s/mongo.yaml -n default'
                bat 'kubectl apply -f k8s/backend.yaml -n default'
                bat 'kubectl apply -f k8s/selenium.yaml -n default'
            }
        }
    }

    post {
        success {
            echo 'Taskflow pipeline completed successfully!'
        }
        failure {
            echo 'Taskflow pipeline failed during execution.'
        }
    }
}
