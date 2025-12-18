# GitLab Workflows Guide

This directory contains example workflows for GitLab operations using the GitLab MCP server.

## Prerequisites

Before running these workflows:

1. **Install Node.js** - Required for npx command
2. **Create GitLab Personal Access Token**: https://gitlab.com/-/user_settings/personal_access_tokens
   - Enable scope: `api` (complete read/write access)
3. **Set environment variables**:
   ```bash
   export GITLAB_TOKEN=your_token_here
   export GITLAB_API_URL=https://gitlab.com/api/v4
   ```
4. **Configure MCP server** - Add to `~/.hackflow/mcp-servers.json`:
   ```json
   {
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

## Available Workflows

### 1. Create Merge Request

**File**: `create-merge-request.yaml`

**Description**: Creates a new merge request in a GitLab project.

**Usage**:
```bash
cd /Users/sourav/Documents/Cloudflare/personal/hackflow
npm run dev -- run workflows/gitlab/create-merge-request.yaml
```

**Prompts**:
1. **Project ID** - Numeric ID (e.g., 12345)
2. **Source branch** - Branch with your changes
3. **Target branch** - Branch to merge into (default: main)
4. **MR title** - Brief summary
5. **MR description** - (Optional) Detailed description
6. **Remove source branch?** - Delete after merge (default: yes)

**Example Output**:
```
🎉 Your merge request is ready!

📋 Title: Add authentication feature
🔀 Merging: feature/auth → main
📁 Project ID: 12345

🔗 View your MR at:
https://gitlab.com/mygroup/myproject/-/merge_requests/123

MR Details:
- MR ID: 123
- State: opened
- Author: John Doe
```

---

### 2. Create Issue

**File**: `create-issue.yaml`

**Description**: Creates a new issue in a GitLab project.

**Usage**:
```bash
npm run dev -- run workflows/gitlab/create-issue.yaml
```

**Prompts**:
1. **Project ID** - Numeric ID
2. **Issue title** - Brief summary
3. **Issue description** - (Optional) Detailed description
4. **Labels** - (Optional) Comma-separated labels

**Example Output**:
```
✓ Issue created successfully!

📋 Title: Bug: Login not working
📁 Project ID: 12345
🔗 Issue URL: https://gitlab.com/mygroup/myproject/-/issues/456

Issue Details:
- Issue ID: 456
- State: opened
- Author: John Doe
```

---

## Finding Your Project ID

GitLab uses **numeric project IDs**. Here's how to find yours:

### Method 1: From Project Page
1. Go to your project on GitLab
2. Look under the project name
3. You'll see: `Project ID: 12345`

### Method 2: From Project Settings
1. Navigate to: `Settings` → `General`
2. The Project ID is displayed at the top

### Method 3: Using API
```bash
curl "https://gitlab.com/api/v4/projects/mygroup%2Fmyproject" \
  -H "PRIVATE-TOKEN: $GITLAB_TOKEN" | jq '.id'
```

## Real-World Examples

### Example 1: Feature Development MR

```bash
# 1. Create your feature branch
git checkout -b feature/user-profiles

# 2. Make your changes and commit
git add .
git commit -m "Add user profile pages"
git push origin feature/user-profiles

# 3. Create MR via Hackflow
npm run dev -- run workflows/gitlab/create-merge-request.yaml

# Answer prompts:
# Project ID: 12345
# Source branch: feature/user-profiles
# Target branch: (press Enter for 'main')
# MR title: Add user profile pages
# MR description: 
# ## What this adds
# - User profile viewing
# - Profile editing
# - Avatar upload
#
# ## Testing
# - All tests passing
# - Manual testing completed
# 
# Remove source branch? (Y/n): y
```

### Example 2: Bug Report

```bash
# Create issue for a bug
npm run dev -- run workflows/gitlab/create-issue.yaml

# Answer prompts:
# Project ID: 12345
# Issue title: Bug: Login fails with special characters
# Issue description:
# ## Problem
# Users with special characters in passwords cannot log in
#
# ## Steps to Reproduce
# 1. Create account with password containing @#$
# 2. Try to log in
# 3. Login fails
#
# ## Expected
# Should login successfully
#
# Labels: bug,authentication
```

### Example 3: Quick Hotfix MR

```bash
# 1. Create hotfix branch
git checkout -b hotfix/security-patch

# 2. Apply fix and push
git add .
git commit -m "Fix: Security vulnerability in auth"
git push origin hotfix/security-patch

# 3. Create urgent MR
npm run dev -- run workflows/gitlab/create-merge-request.yaml

# Use prompts:
# Project ID: 12345
# Source: hotfix/security-patch
# Target: main
# Title: URGENT: Security patch for authentication
# Description: Fixes CVE-2024-XXXXX
# Remove source branch? yes
```

## GitLab API Features

The GitLab MCP server provides access to:

### Core Features (Always Available)
- ✅ Merge Requests (create, read, update, merge)
- ✅ Issues (create, read, update, delete, link)
- ✅ Repository operations (files, branches, commits)
- ✅ Projects (search, create, members)
- ✅ Labels (create, update, delete)

### Optional Features (Enable in Config)

**Wiki Operations**:
```json
"USE_GITLAB_WIKI": "true"
```

**Pipeline/CI Operations**:
```json
"USE_PIPELINE": "true"
```

**Milestone Operations**:
```json
"USE_MILESTONE": "true"
```

## Comparison: GitHub vs GitLab

| Feature | GitHub Workflow | GitLab Workflow |
|---------|----------------|-----------------|
| **Create PR/MR** | `github-create-pr-workflow.yaml` | `gitlab-create-merge-request.yaml` |
| **Create Issue** | `github-create-issue.yaml` | `gitlab-create-issue.yaml` |
| **ID Type** | Owner/Repo name | Numeric Project ID |
| **Default Branch** | Usually `main` | Usually `main` or `master` |
| **Source Branch Cleanup** | Manual | Can auto-remove |

## Advanced Configuration

### Read-Only Mode

For safer operations:

```json
{
  "gitlab": {
    "command": "npx",
    "args": ["-y", "@zereight/mcp-gitlab"],
    "env": {
      "GITLAB_PERSONAL_ACCESS_TOKEN": "${GITLAB_TOKEN}",
      "GITLAB_API_URL": "${GITLAB_API_URL}",
      "GITLAB_READ_ONLY_MODE": "true"
    }
  }
}
```

### Restrict to Specific Projects

Lock down to only certain projects:

```json
"GITLAB_ALLOWED_PROJECT_IDS": "12345,67890,13579"
```

### Self-Hosted GitLab

For GitLab Enterprise:

```json
"GITLAB_API_URL": "https://gitlab.mycompany.com/api/v4"
```

## Tips & Best Practices

### MR Descriptions

Use markdown formatting:

```markdown
## Summary
Brief description of changes

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- Test approach
- Test results

## Related Issues
Closes #123
Related to #456
```

### Labels

Common label patterns:
- `bug`, `feature`, `enhancement`, `documentation`
- `priority::high`, `priority::medium`, `priority::low`
- `status::in-progress`, `status::review`, `status::blocked`

### Branch Naming

Good branch names:
- `feature/user-authentication`
- `bugfix/login-validation`
- `hotfix/security-patch`
- `docs/api-guide`

## Troubleshooting

### "Project not found"

**Error**: `404 Project Not Found`

**Solutions**:
1. Use **numeric Project ID**, not name
2. Check token has project access
3. Verify project isn't private (or token has access)

### "Invalid token"

**Error**: `401 Unauthorized`

**Solutions**:
1. Check: `echo $GITLAB_TOKEN`
2. Verify token has `api` scope
3. Regenerate token if expired

### "npx command not found"

**Solution**: Install Node.js from https://nodejs.org/

### "Rate limit exceeded"

**Solution**: Wait a few minutes. GitLab rate limits:
- Free: 300 requests/minute
- Premium: Higher limits

## Next Steps

1. Set up GitLab token and environment variables
2. Add GitLab to your MCP config
3. Find your project ID
4. Run the workflows and create your first MR!

## Resources

- **Full Documentation**: See `docs/GITLAB_MCP_SERVER.md`
- **GitLab MCP Server**: https://www.npmjs.com/package/@zereight/mcp-gitlab
- **GitLab API**: https://docs.gitlab.com/ee/api/
