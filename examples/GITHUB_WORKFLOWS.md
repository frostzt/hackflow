# GitHub Workflows Examples

This directory contains example workflows demonstrating GitHub MCP Server capabilities.

## Prerequisites

Before running these workflows:

1. **Install Docker** and make sure it's running
2. **Create GitHub Personal Access Token**: https://github.com/settings/personal-access-tokens/new
   - Enable scopes: `repo`, `workflow`, `read:org`
3. **Set environment variable**:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```
4. **Configure MCP server** - Already done in `~/.hackflow/mcp-servers.json`

## Available Workflows

### 1. Create GitHub Issue

**File**: `github-create-issue.yaml`

**Description**: Creates a new issue in a GitHub repository.

**Usage**:
```bash
npm run dev -- run examples/github-create-issue.yaml
```

The workflow will prompt you for:
1. **Repository owner** - Your username or organization
2. **Repository name** - The repo to create the issue in
3. **Issue title** - Brief summary of the issue
4. **Issue description** - (Optional) Detailed description

**Example interaction**:
```
? Repository owner (username or organization): mycompany
? Repository name: webapp
? Issue title: Bug: Login not working
? Issue description (optional, press Enter to skip): 
The login button doesn't respond when clicked.

Steps to Reproduce:
1. Go to /login
2. Enter credentials  
3. Click login button
4. Nothing happens
```

---

### 2. Create Pull Request (Simple)

**File**: `github-create-pr-workflow.yaml`

**Description**: Creates a pull request with basic details and returns the PR link.

**Usage**:
```bash
npm run dev -- run examples/github-create-pr-workflow.yaml
```

The workflow will prompt you for:
1. **Repository owner** - Your username or organization
2. **Repository name** - The repo to create the PR in
3. **Source branch** - Branch with your changes
4. **Target branch** - Branch to merge into (default: main)
5. **PR title** - Brief summary
6. **PR description** - (Optional) Detailed description
7. **Draft PR?** - Whether to create as draft (default: no)

**Example interaction**:
```
? Repository owner (username or organization): mycompany
? Repository name: webapp
? Source branch (the branch with your changes): feature/dark-mode
? Target branch to merge into (default: main): 
? Pull request title: Add dark mode support
? Pull request description (optional, press Enter to skip): This PR adds dark mode toggle to the settings page
? Create as draft PR? (y/N): n
```

**Output**:
```
🎉 Your pull request is ready!

📋 Title: Add dark mode support
🔀 Merging: feature-branch → main
📁 Repository: your-username/your-repo

🔗 View your PR at:
https://github.com/your-username/your-repo/pull/123
```

---

### 3. Create Pull Request (Full Details)

**File**: `github-create-pr-full.yaml`

**Description**: Creates a comprehensive pull request with full details, commit info, and helpful links.

**Usage**:
```bash
npm run dev -- run examples/github-create-pr-full.yaml
```

Same interactive prompts as the simple version. You can provide multi-line descriptions for detailed PRs.

**Example with detailed description**:
```
? Repository owner: mycompany
? Repository name: api-server
? Source branch: feature/authentication
? Target branch (default: main): 
? Pull request title: Add JWT authentication system
? Pull request description: 
## What this PR does

- Implements JWT token generation and validation
- Adds login and logout endpoints
- Includes password hashing with bcrypt
- Updates API documentation

## Testing
- ✅ All unit tests passing (97% coverage)
- ✅ Integration tests passing
- ✅ Manual testing completed

## Security Considerations
- Tokens expire after 24 hours
- Passwords hashed with bcrypt (10 rounds)
- Rate limiting on login endpoint

? Create as draft PR? (y/N): n
```

**Output**: 
```
═══════════════════════════════════════════════════════════
🎉 PULL REQUEST CREATED SUCCESSFULLY!
═══════════════════════════════════════════════════════════

📋 DETAILS:
   Title:      Add JWT authentication system
   PR Number:  #123
   Status:     open
   Draft:      false

🔀 BRANCHES:
   From:       feature/authentication
   Into:       main
   Repository: your-username/your-repo

📝 DESCRIPTION:
## What this PR does
...

🔗 LINKS:
   View PR:    https://github.com/your-username/your-repo/pull/123
   Files:      https://github.com/your-username/your-repo/pull/123/files
   Checks:     https://github.com/your-username/your-repo/pull/123/checks

═══════════════════════════════════════════════════════════

💡 Next Steps:
   - Review your changes at the PR link above
   - Request reviews from team members
   - Wait for CI/CD checks to complete
   - Merge when ready!

═══════════════════════════════════════════════════════════
```

---

## Real-World Examples

### Example 1: Quick Bug Fix PR

```bash
# 1. Create your branch and make changes
git checkout -b fix/login-validation

# 2. Make your code changes
# ... edit files ...

# 3. Commit and push
git add .
git commit -m "Fix login validation logic"
git push origin fix/login-validation

# 4. Create PR via Hackflow
npm run dev -- run examples/github-create-pr-workflow.yaml

# Answer the prompts:
# ? Repository owner: mycompany
# ? Repository name: webapp
# ? Source branch: fix/login-validation
# ? Target branch (default: main): 
# ? Pull request title: Fix: Login validation not checking email format
# ? Pull request description: 
# Fixes #456
# 
# - Add email format validation
# - Add tests for edge cases
# - Update error messages
# 
# ? Create as draft PR? (y/N): n
```

### Example 2: Feature Development PR

```bash
# After developing a feature on a branch
npm run dev -- run examples/github-create-pr-full.yaml

# The workflow prompts for details, paste your full description:
## Summary
Adds a GraphQL API layer on top of the existing REST API.

## Changes
- GraphQL schema definitions
- Resolvers for all entities
- Query optimization with DataLoader
- Comprehensive test suite

## Performance
- 40% reduction in API calls for complex queries
- Better caching with DataLoader

## Documentation
- Updated API docs
- Added GraphQL playground
- Migration guide for REST → GraphQL
```

### Example 3: Creating Multiple PRs

```bash
# Create PR for feature 1
npm run dev -- run examples/github-create-pr-workflow.yaml
# Answer prompts for user profiles feature

# Create PR for feature 2  
npm run dev -- run examples/github-create-pr-workflow.yaml
# Answer prompts for notifications feature

# Create PR for bug fix
npm run dev -- run examples/github-create-pr-workflow.yaml
# Answer prompts for memory leak fix
```

**Tip**: The workflow remembers nothing between runs, so you can create multiple PRs in different repos easily!

---

## Combining with Git MCP Server

You can combine GitHub and Git MCP servers for a complete workflow:

**Workflow**: Make changes → Check status → Create PR

```yaml
name: complete-pr-workflow
mcps_required:
  - git
  - github

steps:
  # 1. Check what changed
  - action: git.git_status
    params:
      repo_path: "."
    output: status

  # 2. Show the diff
  - action: git.git_diff_unstaged
    params:
      repo_path: "."
    output: diff

  # 3. Create the PR
  - action: github.create_pull_request
    params:
      owner: "{{owner}}"
      repo: "{{repo}}"
      head: "{{head}}"
      base: "main"
      title: "{{title}}"
      body: "## Changes\n{{diff}}"
```

---

## Tips & Best Practices

### Writing Good PR Descriptions

Use markdown formatting in the `body` parameter:

```bash
--var body="## Summary
Brief description of changes

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- Test approach
- Test results

## Screenshots (if applicable)
![Before](url)
![After](url)

## Related Issues
Fixes #123
Closes #456"
```

### Draft vs Ready PRs

Use `draft=true` for work-in-progress:

```bash
npm run dev -- run examples/github-create-pr-workflow.yaml \
  --var owner=me \
  --var repo=project \
  --var head=wip-feature \
  --var title="WIP: New feature" \
  --var draft=true
```

Later, update it to ready for review:

```yaml
- action: github.update_pull_request
  params:
    owner: "me"
    repo: "project"
    pullNumber: 123
    draft: false
```

### Branch Naming Conventions

Good branch names help create better PRs:

- `feature/user-auth` → "Add user authentication"
- `fix/login-bug` → "Fix login validation bug"
- `docs/api-guide` → "Update API documentation"
- `refactor/payment-flow` → "Refactor payment processing"

---

## Troubleshooting

### "Docker not running"

**Error**: `Cannot connect to the Docker daemon`

**Solution**: Start Docker Desktop

### "Authentication failed"

**Error**: `401 Unauthorized` or `Bad credentials`

**Solution**:
1. Check token is set: `echo $GITHUB_TOKEN`
2. Verify token has `repo` scope
3. Regenerate token if expired

### "Branch not found"

**Error**: `Reference does not exist`

**Solution**: 
1. Make sure you pushed your branch: `git push origin your-branch`
2. Verify branch name is correct
3. Check you have access to the repository

### "PR already exists"

**Error**: `A pull request already exists`

**Solution**: GitHub doesn't allow duplicate PRs. Either:
1. Close the existing PR first
2. Update the existing PR instead using `github.update_pull_request`

---

## Next Steps

1. Try the basic issue creation workflow
2. Create your first PR using the simple workflow
3. Explore the full PR workflow for complex changes
4. Check out `docs/GITHUB_MCP_SERVER.md` for all available tools
5. Build custom workflows combining multiple GitHub operations!

## Resources

- **GitHub MCP Server Docs**: See `docs/GITHUB_MCP_SERVER.md`
- **All Available Tools**: https://github.com/github/github-mcp-server#tools
- **Hackflow MCP Guide**: See `docs/MCP_GUIDE.md`
