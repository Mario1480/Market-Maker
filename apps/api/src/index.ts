import { createServer } from "./server";

const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;

const server = createServer();
server.listen(port, () => {
  console.log(`API listening on ${port}`);
});
