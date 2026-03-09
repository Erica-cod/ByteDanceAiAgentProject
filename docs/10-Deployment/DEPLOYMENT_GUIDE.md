# Jenkins + Docker CI/CD Deployment Guide

Complete step-by-step guide to set up automated deployment pipeline.

---

## Prerequisites

- Windows 10/11 or Windows Server
- Admin access to your machine
- GitHub account
- Internet connection

---

## Step 1: Install Docker Desktop (Windows)

### 1.1 Download Docker Desktop
1. Visit: https://www.docker.com/products/docker-desktop
2. Download Docker Desktop for Windows
3. Run the installer (`Docker Desktop Installer.exe`)

### 1.2 Installation Steps
1. Follow the installation wizard
2. **Check**: "Use WSL 2 instead of Hyper-V" (recommended)
3. Wait for installation to complete
4. **Restart your computer**

### 1.3 Verify Installation
Open PowerShell and run:
```bash
docker --version
docker-compose --version
```

You should see version numbers.

### 1.4 Test Docker
```bash
docker run hello-world
```

If you see "Hello from Docker!", it's working!

---

## Step 2: Install Jenkins (Using Docker)

### 2.1 Create Jenkins Home Directory
```bash
mkdir C:\jenkins_home
```

### 2.2 Run Jenkins Container
```bash
docker run -d \
  --name jenkins \
  --restart unless-stopped \
  -p 8081:8080 \
  -p 50000:50000 \
  -v C:\jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkins/jenkins:lts
```

**Note**: Jenkins will run on port 8081 (since your app uses 8080)

### 2.3 Get Initial Admin Password
```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Copy the password that appears.

### 2.4 Access Jenkins
1. Open browser: http://localhost:8081
2. Paste the initial admin password
3. Click "Install suggested plugins"
4. Wait for plugins to install
5. Create your first admin user
6. Click "Save and Continue"
7. Click "Start using Jenkins"

---

## Step 3: Configure Jenkins

### 3.1 Install Required Plugins
1. Go to: **Manage Jenkins** → **Manage Plugins**
2. Click **Available** tab
3. Search and install:
   - **GitHub Integration Plugin**
   - **Docker Pipeline Plugin**
   - **NodeJS Plugin**
4. Check "Restart Jenkins when installation is complete"

### 3.2 Configure NodeJS
1. Go to: **Manage Jenkins** → **Global Tool Configuration**
2. Scroll to **NodeJS** section
3. Click **Add NodeJS**
   - Name: `NodeJS 18`
   - Version: Select `NodeJS 18.x`
4. Click **Save**

### 3.3 Configure Docker
1. Go to: **Manage Jenkins** → **Manage Credentials**
2. Click **(global)** → **Add Credentials**
3. If you use Docker Hub:
   - Kind: Username with password
   - Username: Your Docker Hub username
   - Password: Your Docker Hub password
   - ID: `dockerhub`
4. Click **Create**

---

## Step 4: Create Jenkins Pipeline Job

### 4.1 Create New Job
1. Click **New Item**
2. Enter name: `ByteDanceAiAgent-Pipeline`
3. Select **Pipeline**
4. Click **OK**

### 4.2 Configure Job
1. **General** section:
   - ☑ GitHub project
   - Project url: `https://github.com/Erica-cod/ByteDanceAiAgentProject`

2. **Build Triggers** section:
   - ☑ GitHub hook trigger for GITScm polling

3. **Pipeline** section:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/Erica-cod/ByteDanceAiAgentProject.git`
   - Branch: `*/main`
   - Script Path: `Jenkinsfile`

4. Click **Save**

---

## Step 5: Set Up GitHub Webhook

### 5.1 Get Jenkins URL
- If running locally: `http://YOUR_PUBLIC_IP:8081/github-webhook/`
- If you need public access, use ngrok (see Step 6)

### 5.2 Add Webhook in GitHub
1. Go to: https://github.com/Erica-cod/ByteDanceAiAgentProject/settings/hooks
2. Click **Add webhook**
3. Fill in:
   - **Payload URL**: `http://YOUR_JENKINS_URL:8081/github-webhook/`
   - **Content type**: `application/json`
   - **Which events**: Select "Just the push event"
   - ☑ Active
4. Click **Add webhook**

---

## Step 6: (Optional) Expose Jenkins Using ngrok

If your Jenkins is not publicly accessible:

### 6.1 Install ngrok
1. Visit: https://ngrok.com/download
2. Download and extract ngrok
3. Sign up for free account
4. Get your authtoken

### 6.2 Setup ngrok
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 6.3 Expose Jenkins
```bash
ngrok http 8081
```

Use the `https://xxxxx.ngrok.io` URL for GitHub webhook.

---

## Step 7: Test the Pipeline

### 7.1 Manual Test
1. Go to Jenkins: http://localhost:8081
2. Click on your job: `ByteDanceAiAgent-Pipeline`
3. Click **Build Now**
4. Watch the build progress in **Console Output**

### 7.2 Automatic Test
1. Make a small change to your project
2. Commit and push to `main` branch:
```bash
git add .
git commit -m "test: trigger jenkins pipeline"
git push origin main
```
3. Jenkins should automatically start building!

---

## Step 8: Verify Deployment

### 8.1 Check Docker Container
```bash
docker ps
```

You should see `bytedance-ai-agent` container running.

### 8.2 Access Application
Open browser: http://localhost:8080

You should see your AI Agent application!

---

## Troubleshooting

### Docker Permission Error
```bash
# Add Jenkins user to docker group
docker exec -u root jenkins usermod -aG docker jenkins
docker restart jenkins
```

### Port Already in Use
```bash
# Check what's using the port
netstat -ano | findstr :8080
# Kill the process or change port in docker-compose.yml
```

### Jenkins Can't Pull from GitHub
- Check GitHub repository is public
- Or add GitHub credentials in Jenkins

### Build Fails
- Check Console Output in Jenkins
- Verify `Jenkinsfile` is in repository root
- Check Docker is running

---

## Useful Commands

### Docker Commands
```bash
# View running containers
docker ps

# View logs
docker logs bytedance-ai-agent

# Stop container
docker stop bytedance-ai-agent

# Remove container
docker rm bytedance-ai-agent

# View images
docker images

# Remove image
docker rmi bytedance-ai-agent:latest
```

### Jenkins Commands
```bash
# View Jenkins logs
docker logs jenkins

# Restart Jenkins
docker restart jenkins

# Stop Jenkins
docker stop jenkins

# Start Jenkins
docker start jenkins
```

---

## Next Steps

1. ✅ Set up monitoring (e.g., Prometheus + Grafana)
2. ✅ Add automated tests in pipeline
3. ✅ Set up staging environment
4. ✅ Configure SSL/HTTPS
5. ✅ Add notification (Slack, Email)

---

## Architecture Diagram

```
GitHub (push) 
    ↓
GitHub Webhook
    ↓
Jenkins (8081)
    ↓
Build & Test
    ↓
Build Docker Image
    ↓
Deploy Container (8080)
    ↓
Production App
```

---

## Security Recommendations

1. **Don't expose Jenkins publicly** without authentication
2. **Use HTTPS** for production
3. **Store secrets** in Jenkins credentials
4. **Regularly update** Docker images
5. **Enable Docker Content Trust**

---

## Support

If you encounter issues:
1. Check Jenkins Console Output
2. Check Docker logs: `docker logs <container>`
3. Verify ports are not blocked by firewall
4. Ensure Docker is running

---

**🎉 Congratulations! Your CI/CD pipeline is ready!**

Every push to `main` branch will automatically:
1. Trigger Jenkins build
2. Build Docker image
3. Deploy to production
4. Perform health check

