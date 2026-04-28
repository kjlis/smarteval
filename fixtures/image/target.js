const { writeFileSync } = require("node:fs");

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  data += chunk;
});
process.stdin.on("end", () => {
  const row = JSON.parse(data);
  const imagePath = `${row.id}.png`;
  writeFileSync(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwHwQBEPgD/U6VwW8AAAAASUVORK5CYII=",
      "base64"
    )
  );
  console.log(JSON.stringify({ image_path: imagePath, metadata: { prompt: row.input.prompt } }));
});
