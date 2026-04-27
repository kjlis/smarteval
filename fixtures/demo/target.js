let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  data += chunk;
});
process.stdin.on("end", () => {
  const row = JSON.parse(data);
  console.log(JSON.stringify({ answer: row.input.text }));
});
