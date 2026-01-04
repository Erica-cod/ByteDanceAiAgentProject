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

        stage('Run Integration Tests') {
            steps {
                echo 'Running integration tests (must be green to continue)...'
                sh 'npm run test:integration'
            }
        }// Only run integration tests if they are green
        
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
        
        stage('Prepare Network & MongoDB') {
            steps {
                echo '🔧 Preparing Docker network and MongoDB...'
                sh """
                    # 1. 创建 shared-network（如果不存在）
                    docker network inspect shared-network >/dev/null 2>&1 || docker network create shared-network
                    echo "✅ Network shared-network is ready"
                    
                    # 2. 检查并启动 MongoDB（如果未运行）
                    if ! docker ps --format '{{.Names}}' | grep -q '^mongodb-global\$'; then
                        echo "⚠️  MongoDB not running, starting it..."
                        
                        # 如果容器存在但未运行，启动它
                        if docker ps -a --format '{{.Names}}' | grep -q '^mongodb-global\$'; then
                            docker start mongodb-global
                        else
                            # 创建新的 MongoDB 容器
                            docker run -d \\
                                --name mongodb-global \\
                                --network shared-network \\
                                -p 27017:27017 \\
                                -v mongodb-data:/data/db \\
                                mongo:latest
                        fi
                        
                        echo "⏳ Waiting for MongoDB to start..."
                        sleep 5
                    fi
                    
                    # 3. 确保 MongoDB 在 shared-network 中
                    docker network connect shared-network mongodb-global 2>/dev/null || true
                    
                    echo "✅ MongoDB is ready and connected to shared-network"
                    docker network inspect shared-network --format "{{range .Containers}}{{.Name}} {{end}}"
                """
            }
        }
        
        stage('Stop Old Container') {
            steps {
                echo '🛑 Stopping old container if exists...'
                sh """
                    docker compose down || true
                    docker stop ${APP_NAME} || true
                    docker rm ${APP_NAME} || true
                """
            }
        }
        
        stage('Deploy') {
            steps {
                echo '🚀 Deploying new container with docker-compose...'
                sh """
                    # 使用 docker-compose 启动，确保使用正确的网络配置
                    docker compose up -d
                    
                    echo "⏳ Waiting for container to start..."
                    sleep 10
                """
            }
        }
        
        stage('Verify Deployment') {
            steps {
                echo '🔍 Verifying deployment...'
                sh """
                    echo "⏳ Waiting for container to be fully ready..."
                    sleep 15
                    
                    echo "📊 Checking if container is running..."
                    docker ps | grep ${APP_NAME} || exit 1
                    
                    echo "🏥 Checking container health status..."
                    docker inspect --format='{{.State.Health.Status}}' ${APP_NAME} || echo "Waiting for health check..."
                    
                    echo "🔗 Verifying network connection..."
                    echo "Application container networks:"
                    docker inspect ${APP_NAME} --format '{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'
                    echo "MongoDB container networks:"
                    docker inspect mongodb-global --format '{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'
                    
                    echo "📡 Containers in shared-network:"
                    docker network inspect shared-network --format "{{range .Containers}}{{.Name}} {{end}}"
                    
                    echo "📋 Container logs (last 30 lines):"
                    docker logs ${APP_NAME} --tail 30
                    
                    echo "✅ Deployment verification completed!"
                    echo "📍 Application should be accessible at http://localhost:${APP_PORT}"
                    echo "🗄️  MongoDB should be accessible at mongodb-global:27017"
                """
            }
        }
    }
    
    post {
        success {
            echo '✅ Pipeline succeeded! Application deployed successfully.'
            echo "🌐 Application is running at http://localhost:${APP_PORT}"
            echo "🗄️  MongoDB is running at mongodb-global:27017"
            echo "📡 Both containers are connected to shared-network"
        }
        failure {
            echo '❌ Pipeline failed! Rolling back...'
            sh """
                docker compose down || true
                docker stop ${APP_NAME} || true
                docker rm ${APP_NAME} || true
            """
        }
        always {
            echo '🧹 Cleaning up old Docker images...'
            sh 'docker image prune -f'
        }
    }
}

