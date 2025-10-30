# context1000

## Set up environment

In the project where you use agents, create a `.env` file in the root directory of the project.

```bash
touch .env
echo "QDRANT_URL=http://localhost:6333" >> .env
echo "OPENAI_API_KEY=your-key" >> .env
```

### Start Qdrant

```bash
docker run -p 6333:6333 qdrant/qdrant
```


Then add it to Claude Code:

```bash
# Using HTTP transport (default port)
claude mcp add --transport http context1000 http://localhost:3000/mcp

# Using custom port
claude mcp add --transport http context1000 http://localhost:3001/mcp
```

## More information

- [context1000 documentation format](https://github.com/context1000/docs)