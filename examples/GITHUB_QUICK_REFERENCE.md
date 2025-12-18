# GitHub MCP Server - Quick Reference

Quick commands for common GitHub operations using Hackflow.

## Setup (One-time)

```bash
# 1. Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# 2. Make sure Docker is running
# (Start Docker Desktop)

# 3. Test connection
npm run dev -- run examples/github-create-issue.yaml \
  --var owner=your-username \
  --var repo=test-repo \
  --var title="Test issue"
```

## Common Operations

All workflows use interactive prompts - just run and answer the questions!

### Create Issue
```bash
npm run dev -- run examples/github-create-issue.yaml
```

### Create Pull Request
```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
```

### Create Pull Request (with full details)
```bash
npm run dev -- run examples/github-create-pr-full.yaml
```

## Available Workflows

| Workflow | File | Purpose |
|----------|------|---------|
| Create Issue | `github-create-issue.yaml` | Create repository issues |
| Create PR (Simple) | `github-create-pr-workflow.yaml` | Quick PR with link |
| Create PR (Full) | `github-create-pr-full.yaml` | Detailed PR with all info |

## Tool Categories

### Issues
- `issue_write` - Create/update issues
- `issue_read` - Get issue details
- `list_issues` - List repository issues
- `search_issues` - Search across issues

### Pull Requests
- `create_pull_request` - Create new PR
- `update_pull_request` - Update existing PR
- `merge_pull_request` - Merge PR
- `pull_request_read` - Get PR details
- `list_pull_requests` - List PRs

### Repositories
- `search_repositories` - Find repositories
- `get_file_contents` - Read files
- `create_or_update_file` - Write files
- `push_files` - Push multiple files
- `create_branch` - Create branches
- `fork_repository` - Fork repos

### Actions
- `run_workflow` - Trigger workflows
- `list_workflows` - List available workflows
- `get_workflow_run` - Get run details
- `get_job_logs` - Get workflow logs

### Code
- `search_code` - Search code
- `get_commit` - Get commit details
- `list_commits` - List commits
- `get_repository_tree` - Browse repo structure

## Environment Variables

```bash
# Required
export GITHUB_TOKEN=your_token

# Optional - for GitHub Enterprise
export GITHUB_HOST=https://github.company.com
```

## Description Templates

When the workflow prompts for description, you can paste these templates:

### Bug Fix PR
```markdown
## Problem
Describe the bug

## Solution
How you fixed it

## Testing
- Test 1
- Test 2

Fixes #123
```

### Feature PR
```markdown
## What this adds
Feature description

## Changes
- Change 1
- Change 2

## Testing
How it was tested
```

### Docs PR
```markdown
Updates documentation for clarity and accuracy.

Changes:
- Fixed typos
- Updated examples
- Clarified setup instructions
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| Docker not running | Start Docker Desktop |
| Bad credentials | Check `echo $GITHUB_TOKEN` |
| Branch not found | `git push origin branch-name` |
| No access | Check repo permissions |

## Full Documentation

- **Complete Guide**: `docs/GITHUB_MCP_SERVER.md`
- **Workflow Examples**: `examples/GITHUB_WORKFLOWS.md`
- **All Tools**: https://github.com/github/github-mcp-server#tools
