const { execSync } = require("child_process");

const PORTS = [3000, 4000];

function getListeningPids() {
  const pids = new Set();

  for (const port of PORTS) {
    try {
      const output = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid) && pid !== "0") {
          pids.add(pid);
        }
      }
    } catch {
      // No listeners found for this port.
    }
  }

  return [...pids];
}

function killPid(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (process.platform !== "win32") {
    console.log("Skipping Windows port cleanup: non-Windows platform.");
    return;
  }

  const pids = getListeningPids();

  if (pids.length === 0) {
    console.log("Ports 3000 and 4000 are already free.");
    return;
  }

  const killed = [];
  const failed = [];

  for (const pid of pids) {
    if (killPid(pid)) {
      killed.push(pid);
    } else {
      failed.push(pid);
    }
  }

  if (killed.length > 0) {
    console.log(`Killed processes on dev ports: ${killed.join(", ")}`);
  }

  if (failed.length > 0) {
    console.warn(`Could not kill PIDs: ${failed.join(", ")}`);
  }
}

main();
