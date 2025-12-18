# GitLab MCP Server Integration

## Overview

Hackflow integrates with the excellent [@zereight/mcp-gitlab](https://www.npmjs.com/package/@zereight/mcp-gitlab) MCP server to provide comprehensive GitLab operations including:

- **Repository Management**: Create projects, manage branches, push files
- **Issues & Merge Requests**: Create, update, merge MRs and manage issues
- **Code Operations**: Search code, get file contents, analyze commits
- **Pipelines**: Trigger pipelines, get run statuses, view job logs
- **Wiki Management**: Create, update, delete wiki pages
- **Labels, Milestones, Releases** and more!

## Prerequisites

1. **Node.js** - For running the npx command
   - Install Node.js: https://nodejs.org/

2. **GitLab Personal Access Token** or **OAuth2**
   - **Personal Access Token**: Create at: `https://gitlab.com/-/user_settings/personal_access_tokens`
   - **OAuth2** (recommended): More secure, browser-based authentication
   - Required scopes: `api` (complete read/write access)

3. **Environment Variables**
   ```bash
   export GITLAB_TOKEN=your_token_here
   export GITLAB_API_URL=https://gitlab.com/api/v4  # Or your self-hosted instance
   ```
   
   Or add to `~/.zshrc` or `~/.bashrc`:
   ```bash
   echo 'export GITLAB_TOKEN=your_token_here' >> ~/.zshrc
   echo 'export GITLAB_API_URL=https://gitlab.com/api/v4' >> ~/.zshrc
   source ~/.zshrc
   ```

## Configuration

### Option 1: Using Personal Access Token (Simple)

Add to `~/.hackflow/mcp-servers.json`:

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
      "ghcr.io/github/github-mcp-server:main"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "${GITLAB_API_URL}",
      "GITLAB_READ_ONLY_MODE": "false"
    }
  }
}
```

### Option 2: Using OAuth2 (Recommended, More Secure)

**Step 1:** Create GitLab OAuth Application

1. Go to your GitLab instance: `Settings` → `Applications`
2. Create a new application:
   - **Name**: `GitLab MCP Server`
   - **Redirect URI**: `http://127.0.0.1:8888/callback`
   - **Scopes**: Select `api`
3. Copy the **Application ID** (Client ID)

**Step 2:** Configure MCP Server with OAuth

```json
{
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_USE_OAUTH": "true",
      "GITLAB_OAUTH_CLIENT_ID": "your_oauth_client_id_here",
      "GITLAB_OAUTH_REDIRECT_URI": "http://127.0.0.1:8888/callback",
      "GITLAB_API_URL": "${GITLAB_API_URL}",
      "GITLAB_READ_ONLY_MODE": "false"
    }
  }
}
```

On first use, your browser will open for OAuth authorization!

### Configuration Notes

- `${GITLAB_TOKEN}` references your environment variable
- `GITLAB_API_URL` should be `https://gitlab.com/api/v4` or your self-hosted URL
- `GITLAB_READ_ONLY_MODE`: Set to `"true"` for read-only operations
- For self-hosted GitLab, use your instance's API URL

## Available Tools

The GitLab MCP server provides **95+ tools**! Here are the key categories:

### Merge Requests
- `create_merge_request` - Create new merge requests
- `get_merge_request` - Get MR details
- `update_merge_request` - Edit MRs
- `merge_merge_request` - Merge MRs
- `get_merge_request_diffs` - Get MR diffs
- `list_merge_requests` - List project MRs
- `create_merge_request_thread` - Add review comments
- `mr_discussions` - List discussions

### Issues  
- `create_issue` - Create new issues
- `get_issue` - Get issue details
- `update_issue` - Edit issues
- `delete_issue` - Delete issues
- `list_issues` - List issues
- `my_issues` - Issues assigned to you
- `create_issue_note` - Add comments
- `create_issue_link` - Link issues

### Repository Operations
- `create_or_update_file` - Create/update files
- `push_files` - Push multiple files at once
- `get_file_contents` - Read files
- `create_branch` - Create branches
- `get_repository_tree` - Browse repo structure
- `fork_repository` - Fork projects

### Pipelines & CI/CD
- `list_pipelines` - List pipelines
- `get_pipeline` - Get pipeline details
- `create_pipeline` - Trigger pipelines
- `retry_pipeline` - Retry failed pipelines
- `cancel_pipeline` - Cancel running pipelines
- `list_pipeline_jobs` - List jobs
- `get_pipeline_job_output` - Get job logs

### Projects
- `search_repositories` - Search projects
- `create_repository` - Create new projects
- `get_project` - Get project details
- `list_projects` - List your projects
- `list_project_members` - List team members

### Wiki (Optional)
- `list_wiki_pages` - List wiki pages
- `get_wiki_page` - Read wiki pages
- `create_wiki_page` - Create wiki pages
- `update_wiki_page` - Update wiki pages
- `delete_wiki_page` - Delete wiki pages

### Labels & Milestones (Optional)
- `list_labels` - List labels
- `create_label` - Create labels
- `list_milestones` - List milestones
- `create_milestone` - Create milestones
- `get_milestone_issue` - Issues in milestone

Full tool list: https://www.npmjs.com/package/@zereight/mcp-gitlab#tools-️

## Example Workflows

### Create a Merge Request

Located at: `workflows/gitlab/create-merge-request.yaml`

```bash
npm run dev -- run workflows/gitlab/create-merge-request.yaml
```

The workflow will prompt you for:
1. **Project ID** - Numeric ID (find in project settings)
2. **Source branch** - Branch with your changes
3. **Target branch** - Branch to merge into (default: main)
4. **MR title** - Brief summary
5. **MR description** - Detailed description (optional)
6. **Remove source branch?** - Delete after merge (default: yes)

**Output:**
```
🎉 Your merge request is ready!

📋 Title: Add authentication feature
🔀 Merging: feature/auth → main
📁 Project ID: 12345

🔗 View your MR at:
https://gitlab.com/mygroup/myproject/-/merge_requests/123
```

### Create an Issue

Located at: `workflows/gitlab/create-issue.yaml`

```bash
npm run dev -- run workflows/gitlab/create-issue.yaml
```

The workflow will prompt you for:
1. **Project ID** - Numeric ID
2. **Issue title** - Brief summary
3. **Issue description** - Detailed description (optional)
4. **Labels** - Comma-separated (optional)

## Finding Your Project ID

GitLab uses **numeric project IDs** (not project names). To find yours:

### Method 1: From Project Page
1. Go to your project on GitLab
2. Look under the project name
3. You'll see: `Project ID: 12345`

### Method 2: From Project Settings
1. Go to: `Settings` → `General`
2. The Project ID is shown at the top

### Method 3: Using the API
```bash
curl "https://gitlab.com/api/v4/projects/mygroup%2Fmyproject" \
  -H "PRIVATE-TOKEN: your_token"
```

## GitLab vs GitHub

| Feature | GitHub MCP | GitLab MCP |
|---------|-----------|------------|
| **Installation** | Docker | npx |
| **Scope** | GitHub only | GitLab + self-hosted |
| **Authentication** | PAT | PAT or OAuth2 |
| **Tools** | 100+ | 95+ |
| **Pipelines** | GitHub Actions | GitLab CI/CD |
| **Best for** | GitHub.com | GitLab.com + Enterprise |

## Using All Three Servers Together

You can use Git, GitHub, and GitLab servers simultaneously!

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": [
      "run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server:main"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  },
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "${GITLAB_API_URL}"
    }
  }
}
```

**Use cases:**
- **Git server** → Local git operations (status, diff)
- **GitHub server** → GitHub.com automation
- **GitLab server** → GitLab.com or self-hosted automation

## Advanced Features

### Read-Only Mode

For safer operations or when write access isn't needed:

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
  "GITLAB_API_URL": "${GITLAB_API_URL}",
  "GITLAB_READ_ONLY_MODE": "true"
}
```

### Enable Wiki Features

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
  "GITLAB_API_URL": "${GITLAB_API_URL}",
  "USE_GITLAB_WIKI": "true"
}
```

### Enable Pipeline Features

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
  "GITLAB_API_URL": "${GITLAB_API_URL}",
  "USE_PIPELINE": "true"
}
```

### Enable Milestone Features

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
  "GITLAB_API_URL": "${GITLAB_API_URL}",
  "USE_MILESTONE": "true"
}
```

### Restrict to Specific Projects

```json
"env": {
  "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
  "GITLAB_API_URL": "${GITLAB_API_URL}",
  "GITLAB_ALLOWED_PROJECT_IDS": "12345,67890"
}
```

## Self-Hosted GitLab

For GitLab Enterprise or self-hosted instances:

```json
{
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "https://gitlab.mycompany.com/api/v4"
    }
  }
}
```

Make sure your self-hosted GitLab is accessible and you have a valid token!

## Troubleshooting

### "Project not found"

**Error**: `404 Project Not Found`

**Solutions**:
1. Check you're using the **numeric project ID**, not the name
2. Verify your token has access to the project
3. For private projects, ensure your token has `api` scope

### "Invalid authentication"

**Error**: `401 Unauthorized`

**Solutions**:
1. Check token is set: `echo $GITLAB_TOKEN`
2. Verify token hasn't expired
3. Regenerate token with `api` scope

### "npx command not found"

**Error**: `command not found: npx`

**Solution**: Install Node.js from https://nodejs.org/

### OAuth browser doesn't open

**Issue**: OAuth flow not starting

**Solution**:
1. Check redirect URI: `http://127.0.0.1:8888/callback`
2. Ensure port 8888 is available
3. Verify Client ID is correct

### Rate limiting

**Error**: `429 Too Many Requests`

**Solution**: GitLab has rate limits. Wait a few minutes and try again.

## Resources

- **GitLab MCP Server**: https://www.npmjs.com/package/@zereight/mcp-gitlab
- **Full Tool List**: https://www.npmjs.com/package/@zereight/mcp-gitlab#tools-️
- **GitLab API Docs**: https://docs.gitlab.com/ee/api/
- **Personal Access Tokens**: https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html

## Next Steps

1. Create a GitLab Personal Access Token or OAuth app
2. Set `GITLAB_TOKEN` and `GITLAB_API_URL` environment variables
3. Add GitLab config to `~/.hackflow/mcp-servers.json`
4. Run the example workflow:
   ```bash
   npm run dev -- run workflows/gitlab/create-merge-request.yaml
   ```

The workflows will interactively guide you through creating MRs and issues! 🚀
