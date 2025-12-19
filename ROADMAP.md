# Hackflow Roadmap

This roadmap outlines the planned features and improvements for Hackflow, organized by release version.

## Current Version: v0.1.0 (MVP) ✅

**Status**: Shipped

### Core Features
- ✅ Workflow execution engine with YAML definitions
- ✅ SQLite-backed persistent storage
- ✅ Interface-driven architecture (swappable components)
- ✅ Template engine with type preservation
- ✅ Security guard with path validation and rate limiting
- ✅ Interactive CLI with prompts
- ✅ Hybrid MCP client (real + mock)
- ✅ AI integration (Claude provider)
- ✅ Built-in actions (prompt, variable, log, AI)
- ✅ Conditional step execution
- ✅ Config schema with default values

### MCP Integrations
- ✅ Git MCP server (local operations)
- ✅ GitHub MCP server (GitHub.com)
- ✅ GitLab MCP server (GitLab.com + self-hosted)

### Documentation
- ✅ Quickstart guide
- ✅ MCP integration guide
- ✅ GitHub workflows guide
- ✅ GitLab workflows guide
- ✅ Architecture documentation
- ✅ Contributing guide

---

## v0.2.0 - Composability & Testing (Q1 2025)

**Theme**: Make workflows reusable and testable

### High Priority

#### 1. Workflow Composition
**Status**: 🚧 In Progress

Enable workflows to call other workflows:

```yaml
steps:
  - action: workflow.run
    params:
      workflow: validate-code
      vars:
        branch: "{{branch}}"
    output: validation_result
```

**Benefits**:
- Build complex workflows from simple building blocks
- Reuse common patterns (validate, build, deploy)
- Easier maintenance (update one workflow, all consumers benefit)

**Implementation**:
- [ ] Recursive workflow loading
- [ ] Variable passing between workflows
- [ ] Execution context isolation
- [ ] Circular dependency detection
- [ ] Performance optimization (cache loaded workflows)

---

#### 2. Parallel Execution
**Status**: 📋 Planned

Run independent steps simultaneously:

```yaml
steps:
  - action: parallel
    steps:
      - action: npm.test
      - action: docker.build
      - action: security.scan
    output: parallel_results
```

**Benefits**:
- Massive speed improvements for API-heavy workflows
- Better resource utilization
- Shorter feedback loops

**Implementation**:
- [ ] Dependency graph analysis
- [ ] Promise.all execution
- [ ] Parallel step error handling
- [ ] Progress tracking for parallel steps
- [ ] Resource limiting (max concurrent)

---

#### 3. Testing Framework
**Status**: 📋 Planned

Validate workflows before production:

```yaml
# workflow.yaml
name: create-pr
steps:
  - action: github.create_pr
    params:
      title: "{{title}}"

# workflow.test.yaml
test:
  - name: "PR creation succeeds"
    workflow: create-pr
    mock:
      github: true
    vars:
      title: "Test PR"
    assert:
      - pr_result.state == "open"
      - pr_result.title == "Test PR"
  
  - name: "Fails with empty title"
    workflow: create-pr
    vars:
      title: ""
    expect_error: true
```

**Benefits**:
- Catch errors before production
- Automated regression testing
- Documentation through tests

**Implementation**:
- [ ] Test workflow parser
- [ ] Assertion engine
- [ ] Mock data injection
- [ ] Test runner CLI (`hackflow test`)
- [ ] CI integration (exit codes)

---

#### 4. Enhanced Error Recovery
**Status**: 📋 Planned

Better error handling and rollback:

```yaml
steps:
  - action: database.migrate
    retry: 3
    on_error: rollback
    rollback:
      - action: database.restore
        params:
          backup: "{{backup_id}}"
  
  - action: api.call
    timeout: 30s
    on_error: continue  # Don't fail workflow
    fallback:
      - action: log.error
      - action: slack.notify
```

**Benefits**:
- Workflows don't fail completely
- Automatic recovery attempts
- Graceful degradation

**Implementation**:
- [ ] Rollback step definitions
- [ ] Transaction-like execution
- [ ] Timeout support per step
- [ ] Error categorization (retryable vs fatal)
- [ ] Fallback chain execution

---

#### 5. Real Demo Workflows
**Status**: 📋 Planned

End-to-end examples showing real integrations:

```
examples/
├── real-github-pr-demo.yaml      # Branch → Commits → PR → Merge
├── real-gitlab-ci-demo.yaml      # Trigger pipeline → Wait → Report
├── real-kubernetes-deploy.yaml   # Build → Push → Deploy → Health check
└── real-onboarding.yaml          # Complete engineer onboarding
```

**Benefits**:
- Proof that it works in production
- Templates for common use cases
- Best practices demonstration

**Implementation**:
- [ ] GitHub full PR workflow
- [ ] GitLab CI/CD workflow
- [ ] Kubernetes deployment workflow
- [ ] Developer onboarding workflow
- [ ] Video walkthrough

---

## v0.3.0 - Marketplace & Automation (Q2 2025)

**Theme**: Discover, share, and automate workflows

### High Priority

#### 6. Workflow Marketplace
**Status**: 💡 Planned

Install and share workflows:

```bash
# Search
hackflow search "kubernetes deploy"

# Install
hackflow install github:devops/k8s-deploy
hackflow install https://raw.github.com/.../workflow.yaml

# Update
hackflow update k8s-deploy
hackflow update all

# Publish
hackflow publish workflow.yaml
```

**Benefits**:
- Learn from community workflows
- Don't reinvent the wheel
- Share your workflows easily

**Implementation**:
- [ ] GitHub integration for workflow discovery
- [ ] Workflow metadata standard
- [ ] Version management
- [ ] Dependency resolution
- [ ] Workflow catalog website

---

#### 7. Event-Driven Triggers
**Status**: 💡 Planned

Automate workflow execution:

```yaml
name: auto-deploy
triggers:
  # Webhook trigger
  - type: webhook
    path: /deploy
    method: POST
  
  # Schedule trigger
  - type: cron
    schedule: "0 9 * * MON"
  
  # File watch trigger
  - type: file_watch
    paths:
      - "src/**/*.ts"
    events: [create, modify]

steps:
  - action: deploy
    params:
      trigger: "{{trigger.type}}"
```

**Benefits**:
- Fully automated workflows
- React to events in real-time
- Scheduled maintenance tasks

**Implementation**:
- [ ] HTTP server for webhooks
- [ ] Cron scheduler
- [ ] File system watcher
- [ ] Event queue (prevent concurrent runs)
- [ ] Daemon mode (`hackflow daemon`)

---

#### 8. Secrets Management
**Status**: 💡 Planned

Encrypted storage for sensitive data:

```bash
# Set secrets
hackflow secrets set GITHUB_TOKEN
hackflow secrets set DATABASE_URL --file .env

# Use in workflows
env:
  GITHUB_TOKEN: ${secret:GITHUB_TOKEN}
  
# List/Delete
hackflow secrets list
hackflow secrets delete GITHUB_TOKEN
```

**Benefits**:
- Secure credential storage
- No plaintext secrets in YAML
- Team secret sharing (future)

**Implementation**:
- [ ] Encrypted SQLite table
- [ ] Key derivation (password-based)
- [ ] Secret interpolation in workflows
- [ ] CLI secret management
- [ ] Secret rotation support

---

#### 9. Multi-Environment Support
**Status**: 💡 Planned

Different configs per environment:

```yaml
name: deploy

environments:
  development:
    mcps:
      github: mock
      kubernetes: mock
    vars:
      api_url: "http://localhost:3000"
      replicas: 1
  
  staging:
    mcps:
      github: real
      kubernetes: real
    vars:
      api_url: "https://staging-api.com"
      replicas: 2
  
  production:
    mcps:
      github: real
      kubernetes: real
    vars:
      api_url: "https://api.com"
      replicas: 5
    require_approval: true

steps:
  - action: kubernetes.deploy
    params:
      replicas: "{{replicas}}"
```

**Usage**:
```bash
hackflow run deploy --env=staging
hackflow run deploy --env=production  # Prompts for approval
```

**Benefits**:
- Same workflow, different configs
- Safer production deployments
- Environment isolation

**Implementation**:
- [ ] Environment config parsing
- [ ] Environment selection CLI
- [ ] Variable merging (env overrides base)
- [ ] Per-environment MCP configs
- [ ] Approval gates for prod

---

## v0.4.0 - Observability & UI (Q3 2025)

**Theme**: Monitor, debug, and visualize workflows

### High Priority

#### 10. Web UI
**Status**: 💡 Planned

Visual workflow editor and execution dashboard:

**Features**:
- Workflow editor (drag-and-drop steps)
- Execution dashboard (see running workflows)
- Step-by-step debugger
- Execution history explorer
- Workflow visualization (DAG)

**Tech Stack**:
- Frontend: React + TailwindCSS
- Backend: Express.js API
- WebSocket: Real-time execution updates

**Implementation**:
- [ ] REST API for workflows
- [ ] WebSocket server for live updates
- [ ] React workflow editor
- [ ] Execution timeline view
- [ ] Step debugger UI

---

#### 11. Metrics & Observability
**Status**: 💡 Planned

Export metrics and logs:

```yaml
observability:
  metrics:
    - type: prometheus
      endpoint: /metrics
  
  tracing:
    - type: opentelemetry
      endpoint: "http://jaeger:4318"
  
  logging:
    - type: cloudwatch
      group: /hackflow/workflows
```

**Metrics**:
- Workflow execution time
- Success/failure rates
- Step duration
- Error rates by type
- Cost (AI operations)

**Benefits**:
- Monitor workflow health
- Debug performance issues
- Track costs
- Set up alerts

**Implementation**:
- [ ] Metrics collection
- [ ] Prometheus exporter
- [ ] OpenTelemetry integration
- [ ] Log aggregation
- [ ] Cost tracking dashboard

---

#### 12. Workflow Linting
**Status**: 💡 Planned

Pre-execution validation:

```bash
hackflow lint workflow.yaml

Errors:
  ❌ Line 10: Variable 'branch' not defined
  ❌ Line 15: Invalid MCP tool 'github.invalid_tool'
  ❌ Line 20: Circular dependency detected

Warnings:
  ⚠️  Line 5: Unused output 'result'
  ⚠️  Line 12: No retry logic on API call
```

**Benefits**:
- Catch errors before execution
- Better developer experience
- Enforced best practices

**Implementation**:
- [ ] YAML schema validation
- [ ] Variable dependency analysis
- [ ] MCP tool validation
- [ ] Circular dependency detection
- [ ] Best practice checks

---

## v0.5.0+ - Advanced Features (Q4 2025+)

**Theme**: Enterprise features and scalability

### Future Considerations

#### 13. Team Collaboration
- Shared workflow repositories
- Role-based access control
- Workflow approval flows
- Audit logging
- Team secrets management

#### 14. Distributed Execution
- Run workflows on remote agents
- Kubernetes operator
- Queue-based execution
- Load balancing
- Horizontal scaling

#### 15. Advanced AI Features
- AI-generated workflows from descriptions
- Intelligent error recovery suggestions
- Auto-optimize workflows
- Natural language workflow queries

#### 16. Step Libraries
- Pre-built common patterns
- One-click install
- Versioned step definitions
- Community contributions

#### 17. IDE Integration
- VSCode extension
- Workflow autocomplete
- Inline execution
- Step debugging
- YAML validation

---

## Community Requests

Track community-requested features: https://github.com/sst/hackflow/issues

**Top Requests**:
1. ⭐️ Windows support (currently Mac/Linux only)
2. ⭐️ More MCP servers (Jira, Slack, AWS)
3. ⭐️ Workflow import/export (JSON format)
4. ⭐️ Graph visualization of workflow execution
5. ⭐️ Conditional triggers (run only if X changed)

---

## How to Contribute

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to submit feature requests
- How to contribute code
- Development setup guide
- Code review process

### Priority Labels

Issues are labeled by priority:
- 🔥 **P0: Critical** - Blocking issue, fix immediately
- ⭐ **P1: High** - Important for next release
- 📋 **P2: Medium** - Planned for future release
- 💡 **P3: Low** - Nice to have, no timeline

---

## Release Schedule

- **v0.1.0**: January 2025 ✅ (MVP Shipped)
- **v0.2.0**: March 2025 🚧 (Composability & Testing)
- **v0.3.0**: May 2025 📋 (Marketplace & Automation)
- **v0.4.0**: August 2025 💡 (Observability & UI)
- **v0.5.0+**: Q4 2025+ 🔮 (Enterprise Features)

---

## Versioning Policy

Hackflow follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0): Breaking changes to workflow YAML or APIs
- **MINOR** (0.2.0): New features, backward compatible
- **PATCH** (0.1.1): Bug fixes, backward compatible

### Stability Guarantees

- **v0.x.x**: Experimental, breaking changes allowed
- **v1.x.x**: Stable, breaking changes only in major versions
- **v2.x.x**: Mature, LTS support

---

## Questions?

- **Feature Requests**: Open an issue
- **Discussions**: GitHub Discussions
- **Discord**: Coming soon

Let's build the future of workflow automation together! 🚀
