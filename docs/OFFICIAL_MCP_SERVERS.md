# Official MCP Servers Setup Guide

Guide to using the official MCP servers from https://github.com/modelcontextprotocol/servers

## 🎯 Overview

The official MCP servers repository contains many pre-built servers for common tools:
- **Git** - Git operations
- **GitHub** - GitHub API integration
- **GitLab** - GitLab API integration  
- **Filesystem** - File operations
- **PostgreSQL** - Database access
- **Slack** - Slack integration
- **Memory** - Persistent KV storage
- And many more!

## 📦 Two Ways to Use MCP Servers

### Option 1: Published npm Packages (Recommended)

Some servers are published to npm and can be used with `npx`:

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/directory"]
  },
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

**Available packages**:
- `@modelcontextprotocol/server-filesystem`
- `@modelcontextprotocol/server-sequential-thinking`
- More being published regularly

### Option 2: Run from Source (For Latest Features)

Clone and build the official repository:

```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/servers.git
cd servers

# Install dependencies
npm install

# Build all servers
npm run build

# Servers are now in: src/*/build/index.js
```

Then configure:

```json
{
  "git": {
    "command": "node",
    "args": ["/full/path/to/servers/src/git/build/index.js"]
  },
  "github": {
    "command": "node",
    "args": ["/full/path/to/servers/src/github/build/index.js"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "node",
    "args": ["/full/path/to/servers/src/gitlab/build/index.js"],
    "env": {
      "GITLAB_TOKEN": "${GITLAB_TOKEN}"
    }
  }
}
```

## 🚀 Quick Setup

### For Git

**From source**:
```bash
# 1. Clone and build
git clone https://github.com/modelcontextprotocol/servers.git ~/mcp-servers
cd ~/mcp-servers
npm install && npm run build

# 2. Configure Hackflow
cat > ~/.hackflow/mcp-servers.json << 'EOF'
{
  "git": {
    "command": "node",
    "args": ["$HOME/mcp-servers/src/git/build/index.js"]
  }
}
EOF

# 3. Test
hackflow run examples/git-commit-workflow.yaml
```

### For GitHub

```bash
# 1. Get GitHub token
# Go to: https://github.com/settings/tokens
# Create token with repo access

# 2. Set environment variable
export GITHUB_TOKEN=ghp_your_token_here

# 3. Configure
cat > ~/.hackflow/mcp-servers.json << 'EOF'
{
  "github": {
    "command": "node",
    "args": ["$HOME/mcp-servers/src/github/build/index.js"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
EOF
```

### For GitLab

```bash
# 1. Get GitLab token
# Go to: https://gitlab.com/-/profile/personal_access_tokens
# Create token with api access

# 2. Set environment variable
export GITLAB_TOKEN=glpat_your_token_here

# 3. Configure
cat > ~/.hackflow/mcp-servers.json << 'EOF'
{
  "gitlab": {
    "command": "node",
    "args": ["$HOME/mcp-servers/src/gitlab/build/index.js"],
    "env": {
      "GITLAB_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_URL": "https://gitlab.com"
    }
  }
}
EOF
```

## 📋 Complete Example Config

```json
{
  "git": {
    "command": "node",
    "args": ["/Users/yourname/mcp-servers/src/git/build/index.js"]
  },
  "github": {
    "command": "node",
    "args": ["/Users/yourname/mcp-servers/src/github/build/index.js"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "node",
    "args": ["/Users/yourname/mcp-servers/src/gitlab/build/index.js"],
    "env": {
      "GITLAB_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_URL": "https://gitlab.com"
    }
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/projects"]
  },
  "postgres": {
    "command": "node",
    "args": ["/Users/yourname/mcp-servers/src/postgres/build/index.js"],
    "env": {
      "POSTGRES_URL": "${DATABASE_URL}"
    }
  },
  "memory": {
    "command": "node",
    "args": ["/Users/yourname/mcp-servers/src/memory/build/index.js"]
  }
}
```

## 🔍 Finding Available Servers

Check the official repository:
```bash
cd ~/mcp-servers/src
ls -d */

# Output shows available servers:
# brave-search/  fetch/  gdrive/  git/  github/  gitlab/  
# google-maps/  memory/  postgres/  puppeteer/  sequential-thinking/
# slack/  sqlite/  sentry/ ...
```

Each directory is a separate MCP server!

## 🛠️ Building Individual Servers

Don't need all servers? Build just what you need:

```bash
cd ~/mcp-servers

# Build just git server
cd src/git
npm install
npm run build

# Build just github server  
cd src/github
npm install
npm run build
```

## 📝 Available Tools Per Server

### Git Server
- `git_status` - Get git status
- `git_diff_unstaged` - Show unstaged changes
- `git_diff_staged` - Show staged changes
- `git_commit` - Create commit
- `git_add` - Stage files
- `git_reset` - Unstage files
- `git_log` - View commit history
- `git_show` - Show commit details

### GitHub Server
- `create_or_update_file` - Create/update files
- `search_repositories` - Search repos
- `create_repository` - Create new repo
- `get_file_contents` - Read file content
- `push_files` - Push multiple files
- `create_issue` - Create issue
- `create_pull_request` - Create PR
- `fork_repository` - Fork a repo
- `create_branch` - Create branch

### GitLab Server
- `create_or_update_file` - Create/update files
- `search_repositories` - Search projects
- `create_repository` - Create project
- `get_file_contents` - Read file
- `create_issue` - Create issue
- `create_merge_request` - Create MR
- `fork_repository` - Fork project

## 🚨 Common Issues

### Issue: "Cannot find module"

**Solution**: Make sure you built the server:
```bash
cd ~/mcp-servers
npm run build
```

### Issue: "spawn ENOENT"

**Solution**: Check the path in your config is correct:
```bash
# Verify file exists
ls -la ~/mcp-servers/src/git/build/index.js

# Use absolute path, not relative
"args": ["/Users/yourname/mcp-servers/src/git/build/index.js"]
```

### Issue: "Authentication failed"

**Solution**: Check environment variables:
```bash
# For GitHub
echo $GITHUB_TOKEN

# For GitLab  
echo $GITLAB_TOKEN

# Set if missing
export GITHUB_TOKEN=ghp_...
```

### Issue: Server crashes immediately

**Solution**: Check stderr output and dependencies:
```bash
# Run server manually to see errors
node ~/mcp-servers/src/github/build/index.js

# Make sure all deps are installed
cd ~/mcp-servers
npm install
```

## 🎯 Testing Your Setup

Create a test workflow:

```yaml
name: test-mcp
description: Test MCP servers
mcps_required:
  - git
  - github

steps:
  - action: git.git_status
    description: Test git server
    output: git_status

  - action: log.info
    params:
      message: "Git status: {{git_status}}"

  - action: github.search_repositories
    description: Test GitHub server
    params:
      query: "hackflow"
      page: 1
      perPage: 5
    output: repos

  - action: log.info
    params:
      message: "Found repos: {{repos}}"
```

Run it:
```bash
hackflow run test-mcp.yaml
```

## 📚 Resources

- **Official Repo**: https://github.com/modelcontextprotocol/servers
- **MCP Spec**: https://spec.modelcontextprotocol.io/
- **SDK Docs**: https://github.com/modelcontextprotocol/sdk

## 💡 Pro Tips

1. **Keep servers updated**: 
   ```bash
   cd ~/mcp-servers
   git pull
   npm install
   npm run build
   ```

2. **Use environment files**:
   ```bash
   # ~/.hackflow/.env
   GITHUB_TOKEN=ghp_...
   GITLAB_TOKEN=glpat_...
   
   # Load before running
   source ~/.hackflow/.env
   hackflow run workflow.yaml
   ```

3. **Create helper script**:
   ```bash
   # ~/bin/update-mcp-servers
   #!/bin/bash
   cd ~/mcp-servers
   git pull
   npm install
   npm run build
   echo "MCP servers updated!"
   ```

4. **Test server standalone**:
   ```bash
   # Use MCP inspector to test
   npx @modelcontextprotocol/inspector node ~/mcp-servers/src/git/build/index.js
   ```

---

**The official MCP servers are actively maintained and the best choice for production use!**
