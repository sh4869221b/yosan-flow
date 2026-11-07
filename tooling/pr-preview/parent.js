// The parent and its Version URLs never run the application or bind a database.
export default {
  fetch() {
    return new Response("PR previews only", { status: 404 });
  },
};
