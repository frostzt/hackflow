# GitHub MCP Server Integration

## Overview

Hackflow integrates with [GitHub's official MCP server](https://github.com/github/github-mcp-server) to provide comprehensive GitHub operations including:

- **Repository Management**: Create repos, manage branches, push files
- **Issues & PRs**: Create, update, merge pull requests and manage issues  
- **Code Operations**: Search code, get file contents, analyze commits
- **GitHub Actions**: Trigger workflows, get run statuses
- **Code Security**: Access code scanning, Dependabot alerts
- **Discussions, Projects, Releases** and more!

## Prerequisites

1. **Docker** - The GitHub MCP server runs in a Docker container
   - Install Docker: https://www.docker.com/get-started
   - Make sure Docker Desktop is running before using GitHub tools

2. **GitHub Personal Access Token** (PAT)
   - Create at: https://github.com/settings/personal-access-tokens/new
   - Required scopes (enable what you need):
     - `repo` - Full repository access
     - `workflow` - GitHub Actions workflows
     - `read:org` - Organization teams access
     - `read:packages` - Docker image access

3. **Environment Variable**
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```
   
   Or add to `~/.zshrc` or `~/.bashrc`:
   ```bash
   echo 'export GITHUB_TOKEN=your_token_here' >> ~/.zshrc
   source ~/.zshrc
   ```

## Configuration

The GitHub MCP server is configured in `~/.hackflow/mcp-servers.json`:

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

### Configuration Notes

- `${GITHUB_TOKEN}` references the environment variable
- Docker image: `ghcr.io/github/github-mcp-server` (official GitHub image)
- The server runs in a fresh container for each workflow (`--rm` flag)

## Available Tools

The GitHub MCP server provides 100+ tools organized by category:

### Repository Operations
- `search_repositories` - Search for repositories
- `get_file_contents` - Get file or directory contents
- `create_or_update_file` - Create or update files
- `push_files` - Push multiple files at once
- `create_branch` - Create new branches
- `fork_repository` - Fork repositories

### Issues
- `issue_write` - Create or update issues
- `issue_read` - Get issue details, comments, sub-issues
- `list_issues` - List repository issues
- `search_issues` - Search issues across repositories
- `add_issue_comment` - Add comments to issues

### Pull Requests  
- `create_pull_request` - Create new pull requests
- `update_pull_request` - Edit existing PRs
- `merge_pull_request` - Merge pull requests
- `pull_request_read` - Get PR details, diffs, reviews
- `list_pull_requests` - List repository PRs

### GitHub Actions
- `run_workflow` - Trigger workflow runs
- `list_workflows` - List available workflows
- `get_workflow_run` - Get workflow run details
- `get_job_logs` - Get workflow job logs

### Code Security
- `list_code_scanning_alerts` - Code scanning alerts
- `list_dependabot_alerts` - Dependabot vulnerability alerts
- `list_secret_scanning_alerts` - Secret scanning alerts

### And many more...
- Projects, Discussions, Gists, Notifications
- Security advisories, Stargazers, Users, Organizations

Full tool list: https://github.com/github/github-mcp-server#tools

## Example Workflows

### Create an Issue

```yaml
name: create-issue
description: Create a GitHub issue
mcps_required:
  - github

config_schema:
  owner:
    type: string
    required: true
  repo:
    type: string
    required: true
  title:
    type: string
    required: true

steps:
  - action: github.issue_write
    params:
      method: "create"
      owner: "{{owner}}"
      repo: "{{repo}}"
      title: "{{title}}"
      body: "Created via Hackflow"
```

Run it:
```bash
npm run dev -- run examples/github-create-issue.yaml
```

The workflow will interactively ask you for:
- Repository owner
- Repository name
- Issue title
- Issue description (optional)

### Create a Pull Request

**Simple Version** (`examples/github-create-pr-workflow.yaml`):

```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
```

The workflow will interactively ask you for:
- Repository owner
- Repository name
- Source branch (your changes)
- Target branch (default: main)
- PR title
- PR description (optional)
- Whether to create as draft

**Full Version with Details** (`examples/github-create-pr-full.yaml`):

```bash
npm run dev -- run examples/github-create-pr-full.yaml
```

Same interactive prompts, but this workflow will:
1. ✅ Create the pull request
2. ✅ Fetch full PR details
3. ✅ Display comprehensive information
4. ✅ Provide direct links to the PR

### Search Code

```yaml
name: search-code
description: Search code across repositories
mcps_required:
  - github

config_schema:
  query:
    type: string
    required: true

steps:
  - action: github.search_code
    params:
      query: "{{query}}"
      perPage: 10
    output: results
    
  - action: log.info
    params:
      message: "Found {{results}}"
```

## Differences from Git MCP Server

| Feature | Git MCP Server | GitHub MCP Server |
|---------|---------------|-------------------|
| **Language** | Python | Go |
| **Installation** | `uvx mcp-server-git` | Docker |
| **Scope** | Local git operations | Full GitHub API |
| **Tools** | git status, diff, add, commit | 100+ GitHub operations |
| **Push support** | ❌ No | ✅ Yes |
| **Issues/PRs** | ❌ No | ✅ Yes |
| **GitHub Actions** | ❌ No | ✅ Yes |
| **Best for** | Local git inspection | GitHub automation |

## Use Both Servers

You can use both servers together! Each provides different capabilities:

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", 
             "ghcr.io/github/github-mcp-server"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Use git server for**: Local git status, diffs, staging changes
**Use github server for**: Creating issues, PRs, pushing code, GitHub Actions

## Troubleshooting

### Docker not running
```
Error: Cannot connect to the Docker daemon
```
**Solution**: Start Docker Desktop

### Authentication failed
```
Error: Bad credentials
```
**Solution**: 
1. Check `GITHUB_TOKEN` is set: `echo $GITHUB_TOKEN`
2. Verify token has correct permissions
3. Make sure token isn't expired

### Image pull failed
```
Error: pull access denied
```
**Solution**:
```bash
# Pull the image manually first
docker pull ghcr.io/github/github-mcp-server:latest
```

### Tool not found
```
Error: Tool github.some_tool not found
```
**Solution**: Check tool name in the [official docs](https://github.com/github/github-mcp-server#tools)

## Resources

- **Official GitHub MCP Server**: https://github.com/github/github-mcp-server
- **Full Tool List**: https://github.com/github/github-mcp-server#tools
- **GitHub PAT Guide**: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

## Next Steps

1. Install Docker if not already installed
2. Create a GitHub Personal Access Token
3. Set `GITHUB_TOKEN` environment variable
4. Start Docker Desktop
5. Run the example workflow:
   ```bash
   npm run dev -- run examples/github-create-pr-workflow.yaml
   ```
   
   The workflow will interactively ask you for all the details - no complicated command-line flags needed!
