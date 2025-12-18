# Hackflow Example Workflows

This directory contains example workflows to help you get started with Hackflow.

## 📚 Examples

### 1. Hello World (`hello-world.yaml`)

The simplest possible workflow - prints a greeting message.

**Run it:**
```bash
hackflow run examples/hello-world.yaml --var name=Alice
```

**What it does:**
- Logs a greeting message using variable interpolation
- Demonstrates basic workflow structure

**Learn:**
- Workflow definition structure
- Variable interpolation with `{{variable}}`
- Using the `log.info` action

---

### 2. Git Commit Workflow (`git-commit-workflow.yaml`)

A practical workflow for committing changes with an interactive prompt.

**Run it:**
```bash
hackflow run examples/git-commit-workflow.yaml
```

**What it does:**
- Stages all changes
- Prompts you for a commit message
- Commits the changes
- Optionally pushes to remote

**Learn:**
- MCP server integration (`git`)
- Interactive prompts (`prompt.ask`)
- Conditional steps with `if`
- Storing step outputs with `output`

**Options:**
```bash
# Enable auto-push
hackflow run examples/git-commit-workflow.yaml --var auto_push=true

# Custom remote
hackflow run examples/git-commit-workflow.yaml --var remote=upstream
```

---

### 3. Create PR Workflow (`create-pr-workflow.yaml`)

Create a GitHub pull request with smart defaults.

**Run it:**
```bash
hackflow run examples/create-pr-workflow.yaml
```

**What it does:**
- Gets current branch name
- Validates you're not on main
- Prompts for PR title and description
- Creates the PR on GitHub

**Learn:**
- Multiple MCP servers (`git`, `github`)
- Complex conditionals
- Variable manipulation
- Error handling

**Options:**
```bash
# Provide PR title upfront
hackflow run examples/create-pr-workflow.yaml --var pr_title="Add new feature"

# Custom base branch
hackflow run examples/create-pr-workflow.yaml --var base_branch=develop
```

---

## 🎓 Creating Your First Workflow

### Step 1: Basic Structure

Create a file called `my-workflow.yaml`:

```yaml
name: my-workflow
description: My first workflow
version: 1.0.0
author: Your Name

steps:
  - action: log.info
    params:
      message: "Hello from my workflow!"
```

Run it:
```bash
hackflow run my-workflow.yaml
```

### Step 2: Add Variables

Add user input:

```yaml
name: my-workflow
description: My first workflow
version: 1.0.0

config_schema:
  user_name:
    type: string
    required: true

steps:
  - action: log.info
    params:
      message: "Hello, {{user_name}}!"
```

Run it:
```bash
hackflow run my-workflow.yaml --var user_name=Alice
```

### Step 3: Add Interactivity

Prompt the user:

```yaml
name: my-workflow
description: Interactive workflow
version: 1.0.0

steps:
  - action: prompt.ask
    params:
      message: "What's your name?"
    output: user_name

  - action: log.info
    params:
      message: "Hello, {{user_name}}!"
```

### Step 4: Add Conditionals

Make decisions:

```yaml
name: my-workflow
description: Conditional workflow
version: 1.0.0

steps:
  - action: prompt.confirm
    params:
      message: "Should we continue?"
    output: should_continue

  - action: log.info
    if: "{{should_continue}} == true"
    params:
      message: "Continuing..."

  - action: log.info
    if: "{{should_continue}} == false"
    params:
      message: "Cancelled."
```

### Step 5: Use MCP Servers

Integrate with tools:

```yaml
name: my-workflow
description: Git workflow
version: 1.0.0

mcps_required:
  - git

steps:
  - action: git.status
    description: Check repository status
    output: status

  - action: log.info
    params:
      message: "Repository status: {{status}}"
```

## 🔧 Common Patterns

### Pattern 1: Confirmation Before Dangerous Action

```yaml
steps:
  - action: prompt.confirm
    params:
      message: "Are you sure you want to delete this?"
    output: confirmed

  - action: filesystem.delete
    if: "{{confirmed}} == true"
    params:
      path: "{{file_path}}"
```

### Pattern 2: Retry on Failure

```yaml
steps:
  - action: api.call
    params:
      url: "{{api_url}}"
    retry:
      attempts: 3
      delay: 1000
    output: api_response
```

### Pattern 3: Multi-Step with Dependencies

```yaml
steps:
  - action: filesystem.read
    params:
      path: "config.json"
    output: config

  - action: api.call
    params:
      url: "{{config.api_url}}"
      token: "{{config.api_token}}"
    output: api_result

  - action: filesystem.write
    params:
      path: "result.json"
      content: "{{api_result}}"
```

### Pattern 4: Dynamic Prompts

Use AI to interpret responses:

```yaml
steps:
  - action: prompt.ask
    params:
      message: "Describe what commit message you want"
      dynamic: true  # AI interprets the response
    output: commit_msg

  - action: git.commit
    params:
      message: "{{commit_msg}}"
```

## 📖 Built-in Actions

### Log Actions
- `log.info` - Info message
- `log.error` - Error message
- `log.debug` - Debug message (requires `--verbose`)

### Prompt Actions
- `prompt.ask` - Ask for text input
- `prompt.confirm` - Yes/no confirmation
- `prompt.select` - Select from options

### Variable Actions
- `variable.set` - Set a variable
- `variable.get` - Get a variable

### MCP Actions

Depend on installed MCP servers. Common ones:

**Git** (`git.*`):
- `git.stage_all` - Stage all changes
- `git.commit` - Commit changes
- `git.push` - Push to remote
- `git.current_branch` - Get current branch

**GitHub** (`github.*`):
- `github.create_pr` - Create pull request
- `github.create_issue` - Create issue
- `github.comment` - Add comment

**Filesystem** (`filesystem.*`):
- `filesystem.read` - Read file
- `filesystem.write` - Write file
- `filesystem.delete` - Delete file

## 🚀 Advanced Features

### Template Variables

Access nested values:

```yaml
- action: log.info
  params:
    message: "User: {{user.name}}, Email: {{user.email}}"
```

### Complex Conditions

```yaml
# Equality
if: "{{status}} == 'success'"

# Inequality
if: "{{count}} > 0"

# Logical AND
if: "{{enabled}} == true && {{count}} > 0"

# Logical OR
if: "{{env}} == 'dev' || {{env}} == 'test'"
```

### Error Handling

```yaml
- action: risky.operation
  retry:
    attempts: 3
    delay: 2000
```

## 💡 Tips

1. **Test with dry-run**: Use `--dry-run` to test workflows without side effects
2. **Use descriptive names**: Help future you understand what each step does
3. **Add descriptions**: Document why each step exists
4. **Start simple**: Build up complexity gradually
5. **Share workflows**: Workflows are meant to be shared and reused!

## 🆘 Troubleshooting

**Workflow not found:**
```bash
# Use relative or absolute paths
hackflow run ./my-workflow.yaml
hackflow run /full/path/to/workflow.yaml
```

**Variable not found:**
```bash
# Check variable names match config_schema
hackflow run workflow.yaml --var correct_name=value
```

**MCP server not found:**
```bash
# Make sure server is in mcps_required
mcps_required:
  - git
```

**Syntax errors:**
```yaml
# YAML is whitespace-sensitive - use 2 spaces for indentation
steps:
  - action: log.info  # Correct: 2 spaces
    params:           # Correct: 4 spaces (nested)
```

## 📚 Next Steps

1. **Explore the codebase**: See how workflows are executed in `src/core/executor.ts`
2. **Create custom MCPs**: Add new tool integrations
3. **Share your workflows**: Help the community grow
4. **Read CONTRIBUTING.md**: Learn how to contribute

Happy hacking! 🚀
