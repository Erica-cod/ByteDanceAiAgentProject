pipeline {
    agent any
    
    tools {
        nodejs 'NodeJS-20'  // 使用我们在 Jenkins 中配置的 NodeJS 工具
    }
    
    environment {
        // Docker configuration
        DOCKER_IMAGE = 'bytedance-ai-agent'
        DOCKER_TAG = "${BUILD_NUMBER}"
        DOCKER_REGISTRY = 'your-registry' // Change this to your Docker registry
        
        // Application configuration
        APP_NAME = 'bytedance-ai-agent'
        APP_PORT = '8080'
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code from GitHub...'
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm ci'
            }
        }
        
        stage('Build Application') {
            steps {
                echo 'Building application...'
                sh 'npm run build'
            }
        }
        
        stage('Build Docker Image') {
            steps {
                echo 'Building Docker image...'
                sh """
                    docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} .
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest
                """
            }
        }
        
        stage('Stop Old Container') {
            steps {
                echo 'Stopping old container if exists...'
                sh """
                    docker stop ${APP_NAME} || true
                    docker rm ${APP_NAME} || true
                """
            }
        }
        
        stage('Deploy') {
            steps {
                echo 'Deploying new container...'
                sh """
                    docker run -d \\
                        --name ${APP_NAME} \\
                        --restart unless-stopped \\
                        -p ${APP_PORT}:${APP_PORT} \\
                        -e NODE_ENV=production \\
                        -e OLLAMA_API_URL=http://host.docker.internal:11434 \\
                        -e OLLAMA_MODEL=deepseek-r1:7b \\
                        ${DOCKER_IMAGE}:latest
                """
            }
        }
        
        stage('Verify Deployment') {
            steps {
                echo 'Verifying deployment...'
                sh """
                    echo "Waiting for container to be fully ready..."
                    sleep 15
                    
                    echo "Checking if container is running..."
                    docker ps | grep ${APP_NAME} || exit 1
                    
                    echo "Checking container health status..."
                    docker inspect --format='{{.State.Health.Status}}' ${APP_NAME} || echo "No health check configured"
                    
                    echo "Container logs (last 20 lines):"
                    docker logs ${APP_NAME} --tail 20
                    
                    echo "✅ Deployment verification completed!"
                    echo "📍 Application should be accessible at http://localhost:${APP_PORT}"
                """
            }
        }
    }
    
    post {
        success {
            echo 'Pipeline succeeded! Application deployed successfully.'
            echo "Application is running at http://localhost:${APP_PORT}"
        }
        failure {
            echo 'Pipeline failed! Rolling back...'
            sh """
                docker stop ${APP_NAME} || true
                docker rm ${APP_NAME} || true
            """
        }
        always {
            echo 'Cleaning up old Docker images...'
            sh 'docker image prune -f'
        }
    }
}

