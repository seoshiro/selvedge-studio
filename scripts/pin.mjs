import fs from "node:fs/promises";
const p = JSON.parse(await fs.readFile("package.json", "utf8"));
for (const field of ["dependencies", "devDependencies"])
  for (const name of Object.keys(p[field])) {
    const installed = JSON.parse(
      await fs.readFile(`node_modules/${name}/package.json`, "utf8"),
    );
    p[field][name] = installed.version;
  }
await fs.writeFile("package.json", JSON.stringify(p, null, 2) + "\n");
