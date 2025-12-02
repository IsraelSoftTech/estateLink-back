const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Function to kill processes on port 5000 (Windows specific)
async function killPort5000() {
  console.log('🔧 Clearing port 5000...');
  
  try {
    // Windows approach: find and kill processes on port 5000
    await execPromise('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :5000 ^| findstr LISTENING\') do taskkill /f /pid %a');
    console.log('✅ Port 5000 cleared');
  } catch (error) {
    // Command might fail if no processes are found, which is fine
    console.log('✅ Port 5000 is already clear');
  }
  
  // Additional: kill any remaining Node.js processes that might be using the port
  try {
    await execPromise('taskkill /f /im node.exe');
    console.log('✅ Node.js processes cleared');
  } catch (error) {
    // No Node.js processes or they couldn't be killed
    console.log('✅ No Node.js processes to clear');
  }
}

// Function to start the server
async function startServer() {
  console.log('🚀 Starting server...');
  
  try {
    // Kill processes on port 5000
    await killPort5000();
    
    // Wait a moment for processes to terminate
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the actual server
    const { spawn } = require('child_process');
    const serverProcess = spawn('node', ['index.js'], {
      stdio: 'inherit',
      shell: true
    });
    
    serverProcess.on('error', (error) => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
    
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
    });
    
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

// Run the startup process
startServer();
