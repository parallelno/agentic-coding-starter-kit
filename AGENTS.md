# CRITICAL RULES - MUST FOLLOW

## RESPONSES

- Keep responses concise and to the point.
- Always ask clarifying questions
- Never assume design, tech stack or features
- Use deep-dive sub-agents to assist with research
- Use deep-dive sub-agents to review the different aspects of your plan before presenting to the user
- Maximum two concurrent sub-agents
- Never implement features yourself when possible - use sub-agents!
- Identify changes from the plan that can be implemented in parallel, and use sub-agents to implement the features efficiently
- When using sub-agents to implement features, act as a coordinator only
- After completing features (large or small), always run commands like lint, type check and next build to check code quality
- Use workspace `temp` folder for temporary files. Create if needed.
- Use workspace `tests` folder for test files. Create if needed.
- If the workspace is not a Git repository, run git init
- Prefer testing over speculation
- After two rounds of doubt, stop theorizing and test
- Ignore opencode.json.

## TESTING

- Use any testing tools, libraries available to the project for testing your changes
- Never assume your changes simply work, always test!
- If the project does not have any testing tools, scripts, MCP tools, skills, etc. available for testing, ask the user whether testing should be skipped