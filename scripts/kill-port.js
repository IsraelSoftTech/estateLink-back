const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Function to kill processes on a specific port
async function killPort(port) {
  console.log(`🔍 Checking for processes on port ${port}...`);
  
  try {
    // Find processes using the port (Windows)
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
    
    if (stdout.trim()) {
      console.log(`⚠️  Found processes using port ${port}:`);
      console.log(stdout);
      
      // Extract PIDs from the output
      const lines = stdout.split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) {
          pids.add(match[1]);
        }
      });
      
      // Kill each process
      for (const pid of pids) {
        try {
          console.log(`🔪 Killing process PID: ${pid}`);
          await execPromise(`taskkill /PID ${pid} /F`);
        } catch (error) {
          console.log(`⚠️  Could not kill process ${pid}: ${error.message}`);
        }
      }
      
      // Wait a moment for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Port ${port} cleared successfully`);
    } else {
      console.log(`✅ Port ${port} is already free`);
    }
  } catch (error) {
    console.log(`✅ No processes found on port ${port}`);
  }
}

// Function to kill Node.js processes on port 5000 (alternative approach)
async function killNodeProcesses() {
  console.log(`🔍 Checking for Node.js processes...`);
  
  try {
    // Find all Node.js processes
    const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
    
    if (stdout.trim() && stdout.includes('node.exe')) {
      console.log(`⚠️  Found Node.js processes:`);
      console.log(stdout);
      
      // Extract PIDs from CSV output
      const lines = stdout.split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const match = line.match(/"(\d+)"/);
        if (match) {
          pids.add(match[1]);
        }
      });
      
      // Kill each Node.js process
      for (const pid of pids) {
        try {
          console.log(`🔪 Killing Node.js process PID: ${pid}`);
          await execPromise(`taskkill /PID ${pid} /F`);
        } catch (error) {
          console.log(`⚠️  Could not kill Node.js process ${pid}: ${error.message}`);
        }
      }
      
      // Wait a moment for processes to terminate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`✅ Node.js processes cleared successfully`);
    } else {
      console.log(`✅ No Node.js processes found`);
    }
  } catch (error) {
    console.log(`✅ No Node.js processes found`);
  }
}

// Main function
async function main() {
  const port = process.argv[2] || 5000;
  
  console.log(`🚀 Preparing port ${port} for server startup...`);
  
  // Kill processes on specific port
  await killPort(port);
  
  // Kill all Node.js processes (more aggressive approach)
  await killNodeProcesses();
  
  console.log(`🎉 Port ${port} is ready for use`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { killPort, killNodeProcesses };
