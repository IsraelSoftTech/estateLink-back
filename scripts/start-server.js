const { spawn, exec } = require('child_process');
const path = require('path');

// Function to find and kill process on port 5000
function killProcessOnPort(port) {
  return new Promise((resolve) => {
    console.log(`🔍 Checking for processes on port ${port}...`);
    
    // Windows command to find and kill process on specific port
    const command = `netstat -ano | findstr :${port}`;
    
    exec(command, (error, stdout, stderr) => {
      if (stdout) {
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const match = line.match(/\s+(\d+)\s*$/);
          if (match && match[1] !== '0') {
            pids.add(match[1]);
          }
        });
        
        if (pids.size > 0) {
          console.log(`⚠️  Found ${pids.size} process(es) on port ${port}`);
          
          let killedCount = 0;
          pids.forEach(pid => {
            exec(`taskkill /F /PID ${pid}`, (killError) => {
              killedCount++;
              if (killedCount === pids.size) {
                console.log(`✅ Killed ${pids.size} process(es) on port ${port}`);
                setTimeout(resolve, 1000); // Wait for processes to fully terminate
              }
            });
          });
        } else {
          console.log(`✅ Port ${port} is already clear`);
          resolve();
        }
      } else {
        console.log(`✅ Port ${port} is already clear`);
        resolve();
      }
    });
  });
}

// Function to start the server
async function startBackendServer() {
  console.log('🚀 estateLink Backend Server Startup');
  console.log('=====================================');
  
  try {
    // Kill processes on port 5000
    await killProcessOnPort(5000);
    
    // Additional: kill any hanging Node.js processes
    console.log('🔧 Checking for hanging Node.js processes...');
    exec('taskkill /F /IM node.exe', (error, stdout, stderr) => {
      if (!error) {
        console.log('✅ Cleared hanging Node.js processes');
      } else {
        console.log('✅ No hanging Node.js processes found');
      }
      
      // Wait a moment and start the server
      setTimeout(() => {
        console.log('🚀 Starting backend server...');
        console.log('=====================================');
        
        // Start the server with stdio inheritance to see output
        const serverProcess = spawn('node', ['index.js'], {
          stdio: 'inherit',
          cwd: __dirname,
          shell: false
        });
        
        serverProcess.on('error', (err) => {
          console.error('❌ Failed to start server:', err.message);
          process.exit(1);
        });
        
        serverProcess.on('close', (code) => {
          console.log(`\n📋 Server process exited with code ${code}`);
          if (code !== 0) {
            console.log('💡 Try running "npm start" again to restart the server');
          }
        });
        
        // Handle process termination
        process.on('SIGINT', () => {
          console.log('\n🛑 Received SIGINT, shutting down gracefully...');
          serverProcess.kill('SIGINT');
        });
        
        process.on('SIGTERM', () => {
          console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
          serverProcess.kill('SIGTERM');
        });
        
      }, 1500);
    });
    
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Start the server
startBackendServer();
