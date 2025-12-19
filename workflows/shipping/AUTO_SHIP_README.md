# 🚀 Auto-Ship: Intelligent Git Workflow System

**Ship your code with zero friction and maximum intelligence!**

Auto-Ship is an AI-powered workflow system that automatically analyzes your changes, creates properly named branches, generates meaningful commits, and creates PRs/MRs with detailed descriptions. All with minimal human intervention.

## 🎯 What It Does

```
Your Changes → AI Analysis → Smart Branch → Chunked Commits → Push → PR/MR
     ↓              ↓             ↓              ↓            ↓       ↓
  Raw code    Understands    feature/      Logical      origin   Detailed
              what changed   user-auth     groups              description
```

## ✨ Features

- **🤖 AI-Powered Analysis**: Understands what you changed and why
- **🌿 Smart Branch Names**: Follows conventions (`feature/`, `fix/`, etc.)
- **📦 Logical Commits**: Groups changes into coherent commits
- **💬 Meaningful Messages**: Generates conventional commit messages
- **⬆️ Auto Push**: Pushes to origin with proper branch tracking
- **🎯 Intelligent PR/MR**: Creates PR/MR with AI-generated description
- **🔄 Multi-Provider**: Works with GitHub and GitLab

## 🏗️ Architecture

### Main Orchestrator
**`auto-ship.yaml`** - Coordinates all sub-workflows

### Sub-Workflows
1. **`git/analyze-changes.yaml`** - AI analyzes diff and suggests structure
2. **`git/create-branch.yaml`** - Creates and switches to new branch
3. **`git/smart-commit.yaml`** - Creates commits with AI messages
4. **`git/push.yaml`** - Pushes to remote (origin/HEAD)
5. **`git/auto-pr.yaml`** - Generates PR/MR details with AI

Each workflow is composable and can be used independently!

## 🚀 Usage

### Basic: GitHub with Defaults

```bash
# Set your API key for AI
export ANTHROPIC_API_KEY="your-key-here"

# Run auto-ship
hackflow run workflows/auto-ship.yaml \
  --var provider=github \
  --var github_owner=your-username \
  --var github_repo=your-repo
```

### Advanced: GitLab with Custom Target

```bash
hackflow run workflows/auto-ship.yaml \
  --var provider=gitlab \
  --var gitlab_project_id=12345 \
  --var target_branch=develop
```

### Skip Branch Creation (Already on Feature Branch)

```bash
hackflow run workflows/auto-ship.yaml \
  --var provider=github \
  --var github_owner=your-username \
  --var github_repo=your-repo \
  --var skip_branch_creation=true
```

## 📋 Configuration Options

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `provider` | string | `github` | Git provider (`github` or `gitlab`) |
| `target_branch` | string | `main` | Branch to merge into |
| `skip_branch_creation` | boolean | `false` | Skip creating new branch |
| `github_owner` | string | - | GitHub repo owner (required for GitHub) |
| `github_repo` | string | - | GitHub repo name (required for GitHub) |
| `gitlab_project_id` | string | - | GitLab project ID (required for GitLab) |

## 🔧 Prerequisites

### Required Environment Variables

```bash
# For AI features (required)
export ANTHROPIC_API_KEY="sk-ant-..."

# For GitHub PRs
export GITHUB_TOKEN="ghp_..."

# For GitLab MRs
export GITLAB_TOKEN="glpat-..."
export GITLAB_API_URL="https://gitlab.com"
```

### Required MCP Servers

Configure in `~/.hackflow/mcp-servers.json`:

```json
{
  "shell": {
    "command": "npx",
    "args": ["-y", "shell-command-mcp"],
    "env": {
      "ALLOWED_COMMANDS": "npm,cat,ls,pwd,echo,find,grep,node,tsc,git"
    }
  },
  "git": {
    "command": "uvx",
    "args": ["mcp-server-git"]
  },
  "github": {
    "command": "docker",
    "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server:main"],
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

## 🎬 Example Flow

### Starting State
```
main branch with uncommitted changes in multiple files
```

### What Auto-Ship Does

1. **Analyzes Changes**
   ```
   AI: "I see authentication changes in user.ts and auth.ts,
        plus tests in auth.test.ts"
   ```

2. **Creates Branch**
   ```bash
   git checkout -b feature/user-authentication
   ```

3. **Smart Commits**
   ```
   feat(auth): add JWT token validation
   
   Implement JWT token validation middleware for user
   authentication endpoints. Includes token expiry checks
   and refresh token support.
   ```

4. **Pushes**
   ```bash
   git push origin feature/user-authentication
   ```

5. **Creates PR**
   ```markdown
   ## What Changed
   - Added JWT authentication middleware
   - Implemented token refresh mechanism
   - Added comprehensive auth tests
   
   ## Why
   Enhance security by implementing proper token-based auth
   
   ## Testing
   Run `npm test` to verify auth tests pass
   ```

## 🔄 Individual Workflow Usage

You can also use sub-workflows independently:

### Just Analyze Changes
```bash
hackflow run workflows/git/analyze-changes.yaml
```

### Just Push
```bash
hackflow run workflows/git/push.yaml
```

### Just Create Smart Commit
```bash
hackflow run workflows/git/smart-commit.yaml \
  --var files="src/*.ts" \
  --var commit_description="Add authentication logic"
```

## 🎨 Branch Naming Conventions

AI follows these conventions automatically:

- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

## 💡 Tips

1. **Review Before Running**: Use `git status` to see what will be committed
2. **Staged Changes**: Auto-ship commits all changes (staged + unstaged)
3. **Multiple Commits**: Current version creates one comprehensive commit; for multiple commits, run `smart-commit` multiple times
4. **Branch Already Exists**: Use `skip_branch_creation=true` if you're already on a feature branch
5. **AI Quality**: More detailed changes = better AI analysis and messages

## 🐛 Troubleshooting

### "API key required"
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### "Shell command failed with exit code 1"
- Check you're in a git repository
- Ensure you have remote named 'origin'
- Verify you have push permissions

### "Workflow not found: git-analyze-changes"
- Ensure all workflow files are in `workflows/git/` directory
- Check workflow names match exactly

### PR/MR creation fails
- Verify GitHub/GitLab tokens are set
- Check repository permissions
- Ensure MCP servers are configured correctly

## 🚀 Future Enhancements

- [ ] Support for multiple commit groups (loop through AI suggestions)
- [ ] Interactive mode for reviewing commits before push
- [ ] Auto-assign reviewers based on file ownership
- [ ] Label suggestions based on change type
- [ ] Integration with Jira/Linear for ticket linking
- [ ] Support for more git providers (Bitbucket, Azure DevOps)

## 🤝 Contributing

Want to improve Auto-Ship? Here are some ideas:

1. Add support for commit message templates
2. Implement interactive commit review
3. Add pre-commit hooks integration
4. Create workflow for updating existing PRs
5. Add support for git LFS

## 📄 License

Part of Hackflow - MIT License

---

**Built with ❤️ using Hackflow's workflow composition and AI capabilities**
