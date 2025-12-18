# Hackflow Workflows Directory

This directory contains ready-to-use workflow templates organized by tool/service.

## Structure

```
workflows/
├── git/               # Local git operations
│   └── add-commit.yaml
├── gitlab/            # GitLab automation
│   ├── create-merge-request.yaml
│   ├── create-issue.yaml
│   └── GITLAB_WORKFLOWS.md
└── README.md          # This file
```

## Available Workflows

### Git Workflows (`git/`)

Local git operations using the Git MCP server.

- **`add-commit.yaml`** - Stage and commit changes
  ```bash
  npm run dev -- run workflows/git/add-commit.yaml
  ```

**Prerequisites**: Git MCP server configured

**Documentation**: `docs/MCP_GUIDE.md`

---

### GitLab Workflows (`gitlab/`)

GitLab automation using the GitLab MCP server.

- **`create-merge-request.yaml`** - Create merge requests
- **`create-issue.yaml`** - Create issues

**Usage**:
```bash
npm run dev -- run workflows/gitlab/create-merge-request.yaml
npm run dev -- run workflows/gitlab/create-issue.yaml
```

**Prerequisites**: 
- Node.js installed
- GitLab token configured
- GitLab MCP server in `~/.hackflow/mcp-servers.json`

**Documentation**: 
- Full guide: `docs/GITLAB_MCP_SERVER.md`
- Workflow details: `workflows/gitlab/GITLAB_WORKFLOWS.md`

---

## GitHub Workflows

GitHub workflows are in the `examples/` directory:

- **`github-create-pr-workflow.yaml`** - Create GitHub pull requests
- **`github-create-pr-full.yaml`** - Create PRs with full details
- **`github-create-issue.yaml`** - Create GitHub issues

**Usage**:
```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
npm run dev -- run examples/github-create-issue.yaml
```

**Prerequisites**:
- Docker running
- GitHub token configured
- GitHub MCP server in `~/.hackflow/mcp-servers.json`

**Documentation**: 
- Full guide: `docs/GITHUB_MCP_SERVER.md`
- Workflow details: `examples/GITHUB_WORKFLOWS.md`

---

## Workflow Organization

### `/workflows` vs `/examples`

**`/workflows`** directory:
- Ready-to-use production workflows
- Organized by tool/service (git, gitlab, etc.)
- Minimal, focused on specific tasks
- Stable and well-tested

**`/examples`** directory:
- Example/tutorial workflows
- Demonstrates Hackflow features
- May include experimental features
- Mix of different tools and demos

### When to Add Workflows Here

Add workflows to `/workflows` when:
1. ✅ The workflow is production-ready
2. ✅ It's focused on a specific tool/service
3. ✅ It follows the interactive prompt pattern
4. ✅ It's well-documented
5. ✅ It's tested and working

Keep in `/examples` when:
1. 📚 It's a tutorial or demonstration
2. 📚 It shows multiple features at once
3. 📚 It's experimental or in development

## Creating New Workflows

### Directory Structure

When adding a new service (e.g., Bitbucket):

```
workflows/
├── bitbucket/
│   ├── create-pr.yaml
│   ├── create-issue.yaml
│   └── BITBUCKET_WORKFLOWS.md
```

### Workflow Template

```yaml
name: service-action-name
description: Clear description of what this workflow does
version: 1.0.0
author: Your Name

mcps_required:
  - service-name

steps:
  # Use interactive prompts for all inputs
  - action: prompt.ask
    description: Get input
    params:
      message: "What do you need?"
    output: variable_name

  # Perform the action
  - action: service.tool_name
    description: Do the thing
    params:
      param: "{{variable_name}}"
    output: result

  # Display results
  - action: log.info
    params:
      message: |
        ✓ Success!
        
        Result: {{result}}
```

### Documentation Template

Each service directory should have:

1. **Workflow files** (`.yaml`)
2. **Service guide** (`SERVICE_WORKFLOWS.md`) with:
   - Prerequisites
   - Configuration
   - Usage examples
   - Troubleshooting

## Quick Reference

### Running Workflows

```bash
# Run any workflow
npm run dev -- run workflows/path/to/workflow.yaml

# Examples
npm run dev -- run workflows/git/add-commit.yaml
npm run dev -- run workflows/gitlab/create-merge-request.yaml
npm run dev -- run examples/github-create-pr-workflow.yaml
```

### Common Patterns

All workflows follow these patterns:

1. **Interactive prompts** - No `--var` flags needed
2. **Clear output** - Formatted results with links
3. **Error handling** - Graceful failures
4. **Documentation** - Each service has a guide

## Configuration

### MCP Servers Setup

Configure servers in `~/.hackflow/mcp-servers.json`:

```json
{
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
             "ghcr.io/github/github-mcp-server:main"],
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

### Environment Variables

Set these in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export GITHUB_TOKEN=ghp_your_token_here
export GITLAB_TOKEN=glpat_your_token_here
export GITLAB_API_URL=https://gitlab.com/api/v4
```

## Documentation Links

- **Main README**: `/README.md`
- **Quickstart**: `/QUICKSTART.md`
- **MCP Guide**: `/docs/MCP_GUIDE.md`
- **GitHub Guide**: `/docs/GITHUB_MCP_SERVER.md`
- **GitLab Guide**: `/docs/GITLAB_MCP_SERVER.md`

## Contributing

When adding workflows:

1. Follow the interactive prompt pattern
2. Add comprehensive documentation
3. Test thoroughly
4. Update this README

## Future Workflows

Potential additions:
- **Jira** - Issue management
- **Slack** - Notifications
- **Bitbucket** - Code hosting
- **Azure DevOps** - CI/CD
- **Linear** - Issue tracking

Want to contribute? See `/CONTRIBUTING.md`!
