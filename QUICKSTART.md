# Hackflow Quick Start Guide

Get up and running with Hackflow in 5 minutes!

## 🚀 Installation

### From Source (MVP)

```bash
# Clone the repository
git clone https://github.com/yourusername/hackflow.git
cd hackflow

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link

# Or run directly with npm
npm run dev -- <command>
```

## ✅ Verify Installation

```bash
# Check version
hackflow --version

# Initialize Hackflow
hackflow init
```

You should see:
```
✓ Hackflow initialized successfully
  Config directory: ~/.hackflow
```

## 🎯 Your First Workflow

### 1. Hello World

Create a file `hello.yaml`:

```yaml
name: hello-world
description: My first workflow

config_schema:
  name:
    type: string
    required: true
    default: World

steps:
  - action: log.info
    params:
      message: "Hello, {{name}}!"
```

Run it:

```bash
hackflow run hello.yaml --var name=Alice
```

Output:
```
🚀 Running workflow: hello.yaml

[INFO] Hello, Alice!

✓ Workflow completed successfully
  Execution ID: abc-123
  Duration: 1ms
  Steps: 1
```

### 2. Interactive Workflow

Create `greet.yaml`:

```yaml
name: greeting-workflow
description: Interactive greeting

steps:
  - action: prompt.ask
    params:
      message: "What's your name?"
    output: user_name

  - action: prompt.select
    params:
      message: "How are you feeling?"
      options:
        - Happy
        - Excited
        - Peaceful
    output: feeling

  - action: log.info
    params:
      message: "Hello {{user_name}}! Glad you're feeling {{feeling}}!"
```

Run it:

```bash
hackflow run greet.yaml
```

The workflow will prompt you for input!

### 3. Conditional Logic

Create `conditional.yaml`:

```yaml
name: conditional-workflow
description: Demonstrates conditionals

steps:
  - action: prompt.confirm
    params:
      message: "Do you like pizza?"
    output: likes_pizza

  - action: log.info
    if: "{{likes_pizza}} == true"
    params:
      message: "🍕 Pizza lovers unite!"

  - action: log.info
    if: "{{likes_pizza}} == false"
    params:
      message: "🥗 More salad for you!"
```

## 🔧 Common Commands

### Run a Workflow

```bash
# Basic run
hackflow run workflow.yaml

# With variables
hackflow run workflow.yaml --var key=value --var foo=bar

# Dry run (simulate without executing)
hackflow run workflow.yaml --dry-run

# Verbose output
hackflow run workflow.yaml --verbose
```

### List Executions

```bash
# All executions
hackflow list

# Filter by workflow
hackflow list --workflow hello-world

# Limit results
hackflow list --limit 5
```

### Show Execution Details

```bash
hackflow show <execution-id>
```

Example output:
```
Execution Details:

Workflow: hello-world
ID: abc-123
Status: completed
Started: 12/18/2024, 7:00:00 PM
Completed: 12/18/2024, 7:00:01 PM

Steps:

✓ log.info

Context:

{
  "name": "Alice"
}
```

### Cleanup Old Executions

```bash
# Remove executions older than 30 days (default)
hackflow cleanup

# Custom timeframe
hackflow cleanup --days 7
```

## 📝 Workflow Features

### Variables

Define variables users can provide:

```yaml
config_schema:
  repo_name:
    type: string
    required: true
  auto_push:
    type: boolean
    default: false
  environment:
    type: enum
    enum_values:
      - dev
      - staging
      - prod
```

Use variables:

```yaml
steps:
  - action: log.info
    params:
      message: "Deploying {{repo_name}} to {{environment}}"
```

### Conditionals

Execute steps conditionally:

```yaml
# Simple equality
- action: log.info
  if: "{{env}} == 'prod'"
  params:
    message: "Production deployment!"

# Comparison
- action: deploy
  if: "{{version}} > 1.0"

# Logical operators
- action: notify
  if: "{{env}} == 'prod' && {{notify_enabled}} == true"
```

### Output Variables

Store step results:

```yaml
- action: git.current_branch
  output: branch

- action: log.info
  params:
    message: "Current branch: {{branch.name}}"
```

### Retry Logic

Retry failed steps:

```yaml
- action: api.call
  params:
    url: "{{api_url}}"
  retry:
    attempts: 3
    delay: 1000  # milliseconds
  output: api_response
```

### Interactive Prompts

#### Text Input

```yaml
- action: prompt.ask
  params:
    message: "Enter commit message"
    dynamic: false  # static mode (default)
  output: commit_msg
```

#### Confirmation

```yaml
- action: prompt.confirm
  params:
    message: "Are you sure?"
  output: confirmed
```

#### Selection

```yaml
- action: prompt.select
  params:
    message: "Choose environment"
    options:
      - development
      - staging
      - production
  output: env
```

## 🎨 Built-in Actions

### Logging

```yaml
- action: log.info
  params:
    message: "Information message"

- action: log.error
  params:
    message: "Error message"

- action: log.debug
  params:
    message: "Debug message"
```

### Variables

```yaml
- action: variable.set
  params:
    name: my_var
    value: "some value"

- action: variable.get
  params:
    name: my_var
  output: retrieved_value
```

### Prompts

See "Interactive Prompts" section above.

## 🔌 MCP Integration

### Using MCP Servers

Specify required servers:

```yaml
mcps_required:
  - git
  - github
  - filesystem

steps:
  - action: git.status
    output: git_status

  - action: github.create_issue
    params:
      title: "Bug report"
      body: "Description"
    
  - action: filesystem.read
    params:
      path: "README.md"
    output: readme_content
```

### Available Actions

Actions depend on connected MCP servers. Common ones:

**Git** (`mcps_required: [git]`):
- `git.stage_all`
- `git.commit`
- `git.push`
- `git.current_branch`
- `git.status`

**GitHub** (`mcps_required: [github]`):
- `github.create_pr`
- `github.create_issue`
- `github.add_comment`

**Filesystem** (`mcps_required: [filesystem]`):
- `filesystem.read`
- `filesystem.write`
- `filesystem.delete` (requires confirmation)

## 🛡️ Safety Features

### Dry Run Mode

Test workflows without side effects:

```bash
hackflow run dangerous-workflow.yaml --dry-run
```

Output shows what would be executed:
```
[DRY RUN] Would execute: file.delete with params: { path: "/file.txt" }
```

### Protected Operations

These operations require confirmation:

1. **File Deletion**: Always asks for confirmation
2. **Git Push to Main**: Requires confirmation
3. **Bulk Operations**: Requires confirmation

### Path Restrictions

- Write/delete operations restricted to current directory
- System directories are protected (`/System`, `/bin`, etc.)
- Can configure allowed paths in code

## 🎓 Learn More

### Example Workflows

Check out `examples/` directory:

1. **hello-world.yaml** - Basic workflow structure
2. **git-commit-workflow.yaml** - Git integration with prompts
3. **create-pr-workflow.yaml** - Multi-MCP workflow

### Documentation

- **README.md** - Project overview
- **ARCHITECTURE.md** - System design
- **CONTRIBUTING.md** - How to contribute
- **examples/README.md** - Workflow examples and patterns

### Next Steps

1. **Try Examples**:
   ```bash
   hackflow run examples/hello-world.yaml --var name=YourName
   hackflow run examples/git-commit-workflow.yaml
   ```

2. **Create Your Own**:
   - Start with a simple workflow
   - Add interactivity
   - Integrate with MCP servers

3. **Share**:
   - Workflows are just YAML files
   - Share via GitHub repositories
   - Help grow the ecosystem

## 🆘 Troubleshooting

### Command not found

If `hackflow` command isn't found after `npm link`:

```bash
# Use npm run dev instead
npm run dev -- run workflow.yaml

# Or use full path
./dist/cli/index.js run workflow.yaml
```

### YAML syntax errors

```bash
# YAML is whitespace-sensitive
# Use 2 spaces for indentation (not tabs)

# ✅ Correct
steps:
  - action: log.info
    params:
      message: "Hello"

# ❌ Wrong (inconsistent indentation)
steps:
 - action: log.info
   params:
     message: "Hello"
```

### Variable not found

```bash
# Make sure variable name matches
config_schema:
  user_name:  # This is the variable name
    type: string

# Use exact name in interpolation
message: "Hello {{user_name}}"  # Not {{username}}
```

### Workflow not found

```bash
# Use correct path
hackflow run ./my-workflow.yaml  # Relative path
hackflow run /full/path/workflow.yaml  # Absolute path
```

## 💬 Get Help

- **Issues**: [GitHub Issues](https://github.com/frostzt/hackflow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/frostzt/hackflow/discussions)
- **Examples**: Check `examples/` directory

## 🎉 You're Ready!

You now know the basics of Hackflow. Start creating workflows and share them with the community!

```bash
# Create your first workflow
hackflow run my-first-workflow.yaml

# Make it awesome
# Share it with others
# Build something cool!
```

Happy hacking! 🚀
