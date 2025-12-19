# Why Hackflow? The Case for Workflow Automation

## The Problem: "Why not just write a markdown file or shell script?"

You're right to ask this question. Let's be honest about what makes Hackflow different from:
- **Markdown files**: Static docs that require manual copy-paste
- **Shell scripts**: One-off automation that breaks and has no memory
- **GitHub Actions**: Cloud-only, YAML hell, no local development
- **Make/Rake/npm scripts**: No state, no context, no AI

## What Hackflow Actually Is

Hackflow is **not** just YAML command execution.

It's a **stateful, AI-powered agent framework** where:
- Every component is swappable (storage, AI, security, MCP clients)
- Workflows are plugins, not code
- State persists across runs
- AI can interpret natural language
- Security is built-in, not bolted on

Think: **"Vim for AI agents"** - minimal core, maximum customization.

## The Killer Features (What You Get That Others Don't)

### 1. **Stateful Execution with Full History**

**Problem**: Shell scripts run and forget. No audit trail. No resumability.

**Hackflow Solution**:
```yaml
# Every step is saved to SQLite
steps:
  - action: github.create_pr
    output: pr_result
    # This PR creation is SAVED
    # You can query it later: hackflow executions list
    # You can resume if it fails
    # You have full audit trail
```

**Real Example**:
```bash
# Run workflow
hackflow run deploy-to-prod

# It fails at step 5 of 10
# With scripts: start over
# With Hackflow: resume from step 5

hackflow resume <execution-id>
```

**Why it matters**: Long-running workflows (deploy, migration, bulk operations) are resilient. You don't lose progress.

---

### 2. **AI-Powered Dynamic Prompts**

**Problem**: Static prompts are rigid. Users say things differently than your script expects.

**Hackflow Solution**:
```yaml
# Traditional (boring):
- action: prompt.ask
  params:
    message: "Enter commit message"
  output: msg

# AI-powered (smart):
- action: prompt.ask
  params:
    message: "What did you change?"
    dynamic: true  # ← AI interprets natural language
  output: msg
```

**Real Example**:
```yaml
User types: "fixed that annoying login bug and added some tests"
AI extracts: "Fix: Login validation + Add tests"

User types: "idk just updated stuff"
AI extracts: "Update: Minor improvements"
```

**Why it matters**: Your workflows adapt to how users actually communicate, not how you think they should.

---

### 3. **Type-Preserving Template Engine**

**Problem**: Everything becomes a string. `"true"` ≠ `true`. APIs reject your requests.

**Hackflow Solution**:
```yaml
- action: prompt.confirm
  output: draft  # Returns: true (boolean)

- action: github.create_pr
  params:
    draft: "{{draft}}"  # Sent as: true (boolean, not "true")
    # GitHub API happy ✅
```

**What others do**:
```bash
# Bash
IS_DRAFT="true"  # It's a string
curl -d "draft=$IS_DRAFT"  # Fails: "true" ≠ true

# Python
draft = "true"
draft == True  # False! String vs boolean
```

**Why it matters**: APIs expect types. Hackflow preserves them. No more "400 Bad Request" from type mismatches.

---

### 4. **Hybrid MCP Architecture (Works Immediately, Scales to Production)**

**Problem**: 
- Mock tools → Easy to start, useless in prod
- Real tools → Powerful, painful to configure

**Hackflow Solution**: Both!

```yaml
# Day 1: Works out of box (mock)
mcps_required:
  - github  # Uses mock server (no config needed)

# Day 30: Production (real)
# Just add config, workflows don't change
# ~/.hackflow/mcp-servers.json:
{
  "github": {
    "command": "docker",
    "args": ["run", "ghcr.io/github/github-mcp-server"]
  }
}
```

**Per-server control**:
```json
{
  "github": { "real": true },   // Production GitHub
  "gitlab": { "mock": true },   // Still testing
  "slack": { "real": true }     // Production Slack
}
```

**Why it matters**: 
- Developers can build workflows without API keys
- QA can test without hitting rate limits
- Production uses real services
- Same workflow YAML for all environments

---

### 5. **Security That Actually Works**

**Problem**: Shell scripts with `rm -rf` or API calls that cost $$$. Scary.

**Hackflow Security**:

```yaml
# Protected operation (requires confirmation)
- action: git.push
  params:
    branch: main  # ← Hackflow detects: pushing to main!
  # Prompts: "⚠️  Push to main branch. Continue? [y/N]"

# Cost-aware AI operations
- action: ai.generate
  params:
    prompt: "Generate 1000 commit messages"
  # Estimates: "This will cost ~$5.00. Continue? [y/N]"

# Path validation
- action: file.delete
  params:
    path: "/etc/passwd"  # ← Blocked! System path
  # Error: "Cannot delete system files"
```

**Built-in protections**:
1. **Path whitelisting**: Can't delete `/System`, `/bin`, `~/.ssh`
2. **Rate limiting**: Per-action throttling (no runaway API costs)
3. **Confirmation prompts**: Dangerous ops require explicit approval
4. **Dry-run mode**: Test without executing
5. **Cost estimation**: AI operations show price before running

**Why it matters**: You can give workflows to junior devs without worrying they'll delete production.

---

### 6. **Composable, Not Monolithic**

**Problem**: Workflows get huge and unmaintainable. Copy-paste everywhere.

**Hackflow** (coming in v0.2):
```yaml
# Base workflow: validate-pr.yaml
steps:
  - action: lint
  - action: test
  - action: security-scan

# Composite workflow: deploy.yaml
steps:
  - action: workflow.run
    params:
      workflow: validate-pr  # Reuse!
  
  - action: workflow.run
    params:
      workflow: build-docker
  
  - action: workflow.run
    params:
      workflow: deploy-k8s
```

**Why it matters**: Build once, reuse everywhere. Workflows become LEGO blocks.

---

## Real-World Use Cases (What You'd Actually Use This For)

### 1. **The "Release to Production" Workflow**

**Without Hackflow** (shell script):
```bash
#!/bin/bash
# Breaks if ANY step fails. No resume. No state.
git checkout main
git pull
npm run build
docker build -t app:latest .
docker push app:latest
kubectl apply -f k8s/
# Fails at step 5? Start over. No history. No audit.
```

**With Hackflow**:
```yaml
name: release-to-production
mcps_required: [git, docker, kubernetes]

steps:
  # Step 1: Validate (safe, idempotent)
  - action: git.status
    output: status
  
  # Step 2: Confirmation (security)
  - action: prompt.confirm
    params:
      message: "⚠️  Deploy to PRODUCTION?"
    output: confirmed
  
  - action: exit
    if: "{{confirmed}} == false"
  
  # Step 3: Build (resumable)
  - action: npm.build
    retry: 3
    output: build_result
  
  # Step 4: Docker (resumable)
  - action: docker.build
    params:
      tag: "app:{{version}}"
    output: image
  
  # Step 5: Push (with rollback)
  - action: docker.push
    params:
      image: "{{image}}"
    on_error: rollback
  
  # Step 6: Deploy (with health checks)
  - action: kubernetes.apply
    params:
      manifest: "k8s/production.yaml"
    health_check: true
    
  # Step 7: Notify (Slack)
  - action: slack.message
    params:
      channel: "#deploys"
      text: "✅ Production deployed: {{version}}"
```

**Benefits**:
- ✅ Every step saved (can resume)
- ✅ Security confirmation
- ✅ Retry logic on failures
- ✅ Full audit trail in DB
- ✅ Notifications
- ✅ Rollback capability

**Cost**: 20 minutes to write once. Saves hours every deploy.

---

### 2. **The "Onboard New Engineer" Workflow**

**Without Hackflow**:
- 50-page markdown document
- Engineer copies commands, some work, some don't
- Takes 2 days, lots of Slack questions
- Every engineer has slightly different setup

**With Hackflow**:
```yaml
name: onboard-engineer
description: Set up everything for new engineers

steps:
  # Get their info
  - action: prompt.ask
    params:
      message: "Your GitHub username?"
    output: github_user
  
  # Check prerequisites
  - action: system.check
    params:
      requirements: [git, docker, node]
    output: prereqs
  
  # Install missing tools
  - action: brew.install
    if: "{{prereqs.missing.length}} > 0"
    params:
      packages: "{{prereqs.missing}}"
  
  # Clone repos
  - action: github.clone
    params:
      org: "mycompany"
      repos: ["api", "frontend", "mobile"]
  
  # Set up env files
  - action: file.create
    params:
      path: "api/.env"
      template: "templates/dev.env"
      vars:
        github_user: "{{github_user}}"
  
  # Add SSH key to GitHub
  - action: ssh.generate
    output: ssh_key
  
  - action: github.add_ssh_key
    params:
      key: "{{ssh_key.public}}"
      title: "Dev machine - {{github_user}}"
  
  # Start databases
  - action: docker.compose
    params:
      file: "docker-compose.dev.yaml"
      command: up
  
  # Success
  - action: slack.message
    params:
      channel: "#engineering"
      text: "Welcome {{github_user}}! 🎉 Setup complete."
```

**Result**:
- New engineer runs ONE command: `hackflow run onboard`
- Takes 10 minutes (automated)
- Consistent setup every time
- If it fails (network issue), they resume with `hackflow resume`
- Manager gets Slack notification when done

---

### 3. **The "Weekly Maintenance" Workflow**

**Without Hackflow**:
- Engineer remembers (sometimes)
- Runs commands manually
- Forgets steps
- No record it was done

**With Hackflow + Cron** (coming):
```yaml
name: weekly-maintenance
schedule: "0 9 * * MON"  # Every Monday 9am

steps:
  # Check for dependency updates
  - action: npm.outdated
    output: outdated
  
  # Create PR with updates
  - action: github.create_pr
    if: "{{outdated.length}} > 0"
    params:
      title: "Weekly: Dependency updates"
      body: |
        Automated dependency updates:
        {{outdated}}
  
  # Clean old Docker images
  - action: docker.prune
    params:
      older_than: "7d"
  
  # Backup databases
  - action: postgres.backup
    params:
      databases: ["users", "orders"]
      destination: "s3://backups/"
  
  # Check SSL certificates
  - action: ssl.check
    params:
      domains: ["api.example.com", "app.example.com"]
    output: ssl_status
  
  # Alert if expiring soon
  - action: slack.message
    if: "{{ssl_status.expiring_soon}} > 0"
    params:
      channel: "#ops"
      text: "⚠️  SSL certificates expiring: {{ssl_status.domains}}"
  
  # Weekly report
  - action: email.send
    params:
      to: "team@example.com"
      subject: "Weekly Maintenance Report"
      body: |
        ✅ Dependencies: {{outdated.length}} updates
        ✅ Docker cleanup: completed
        ✅ Backups: completed
        ⚠️  SSL: {{ssl_status.expiring_soon}} expiring soon
```

**Result**:
- Automated weekly tasks
- Full audit trail (when it ran, what it did)
- Alerts if something needs attention
- Team knows maintenance is done

---

## What You CAN'T Do With Simple Markdown/Scripts

| Feature | Markdown | Shell Script | GitHub Actions | **Hackflow** |
|---------|----------|--------------|----------------|--------------|
| **Resume from failure** | ❌ Manual | ❌ Start over | ❌ Start over | ✅ Resume any step |
| **Full execution history** | ❌ None | ❌ Logs only | ✅ Limited | ✅ SQLite database |
| **Type-safe parameters** | ❌ Copy-paste | ❌ All strings | ⚠️ Basic | ✅ Boolean/number/object |
| **AI interpretation** | ❌ | ❌ | ❌ | ✅ Dynamic prompts |
| **Security validation** | ❌ | ❌ | ⚠️ Basic | ✅ Multi-layer |
| **Works offline** | ✅ Static | ✅ | ❌ Cloud-only | ✅ With mock MCPs |
| **Composable workflows** | ❌ | ⚠️ Functions | ⚠️ Reusable | ✅ Workflow-as-code |
| **Cost estimation** | ❌ | ❌ | ❌ | ✅ AI operations |
| **Dry-run mode** | ❌ | ⚠️ Manual | ❌ | ✅ Built-in |
| **Interactive prompts** | ❌ | ✅ read | ❌ | ✅ With AI |

---

## What We Should Build Next (Priority Order)

### **🔥 Must-Have (v0.2)**

#### 1. **Workflow Composition** 
**Why**: Reusability. Build once, use everywhere.
```yaml
- action: workflow.run
  params:
    workflow: validate-code
```

#### 2. **Parallel Execution**
**Why**: Speed. Run independent steps simultaneously.
```yaml
- action: parallel
  steps:
    - workflow: run-tests
    - workflow: build-docker
    - workflow: security-scan
```

#### 3. **Testing Framework**
**Why**: Confidence. Validate workflows before production.
```yaml
test:
  - name: "PR creation works"
    workflow: create-pr
    mock: github
    assert:
      - pr_result.state == "open"
      - pr_result.title == "expected"
```

#### 4. **Better Error Recovery**
**Why**: Resilience. Don't fail the whole workflow for one step.
```yaml
- action: api.call
  retry: 3
  on_error: continue  # or rollback, or abort
  fallback:
    - action: log.error
    - action: slack.notify
```

#### 5. **Real Demo Workflow**
**Why**: Proof it works. Show actual GitHub PR creation end-to-end.
```bash
hackflow run examples/real-github-pr-demo.yaml
# Shows: Branch → Commits → PR → Checks → Merge
```

---

### **⭐ High-Value (v0.3)**

#### 6. **Workflow Marketplace**
**Why**: Discovery. Learn from others, share your workflows.
```bash
hackflow search "deploy kubernetes"
hackflow install github:devops/k8s-deploy
hackflow update all
```

#### 7. **Event-Driven Triggers**
**Why**: Automation. React to webhooks, schedules, file changes.
```yaml
triggers:
  - webhook: /deploy
  - cron: "0 9 * * MON"
  - file_watch: "src/**/*.ts"
```

#### 8. **Secrets Management**
**Why**: Security. Encrypted storage for API keys.
```bash
hackflow secrets set GITHUB_TOKEN
# Encrypted in ~/.hackflow/secrets.db
```

```yaml
env:
  GITHUB_TOKEN: ${secret:GITHUB_TOKEN}
```

#### 9. **Multi-Environment Support**
**Why**: Flexibility. Different configs for dev/staging/prod.
```bash
hackflow run deploy --env=production
hackflow run deploy --env=staging
```

```yaml
environments:
  production:
    mcps:
      github: real
    vars:
      api_url: "https://api.prod.com"
  staging:
    mcps:
      github: mock
    vars:
      api_url: "https://api.staging.com"
```

---

### **🎁 Nice-to-Have (Future)**

10. **Web UI** - Visual editor, execution dashboard
11. **Metrics Export** - Prometheus, DataDog integration
12. **Workflow Linting** - Pre-execution validation
13. **Step Libraries** - Common patterns (send-email, create-ticket)
14. **Streaming Execution** - Real-time output via WebSocket

---

## The Pitch: Why Use Hackflow?

### **For Solo Developers**
"I'm tired of forgetting the 15 steps to deploy. I run `hackflow run deploy` and it just works. If it fails at step 10, I fix it and resume. My deploy history is in SQLite. I can query 'show me all failed deploys this month'."

### **For Teams**
"New engineer onboarding used to take 2 days of copy-pasting commands. Now they run `hackflow run onboard` and they're productive in 10 minutes. Every engineer has the exact same setup. We have audit trails of who ran what."

### **For DevOps**
"I need to run maintenance tasks weekly. Hackflow runs them on schedule, logs everything to a database, and alerts Slack if something fails. I can prove compliance because every step is recorded."

### **For AI-Powered Workflows**
"My workflows ask natural language questions. 'What did you change?' and the AI extracts a proper commit message. No more 'fixed stuff' commits. And when the AI costs $10 to run, Hackflow warns me before spending."

---

## Bottom Line

**Hackflow is not replacing your shell scripts.**

It's **replacing**:
- The manual process you forgot 3 steps of
- The one-off script that breaks every time
- The runbook that's out of date
- The deploy that failed and you lost all progress
- The onboarding doc nobody follows
- The maintenance task you forgot to run

**It's making workflows**:
- Stateful (resume from anywhere)
- Secure (confirmations, cost estimates, path validation)
- Intelligent (AI-powered prompts)
- Composable (workflows call workflows)
- Auditable (full history in database)
- Reliable (retry logic, error handling, dry-run)

**Hackflow = Vim for AI Agents**

Minimal core. Maximum customization. Workflows as plugins. Interfaces everywhere. Swap any component. Ship to production.

That's why you'd use it.
