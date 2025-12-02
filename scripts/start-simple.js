const { spawn } = require('child_process');
const { exec } = require('child_process');

// Simple port killing function
function killPort5000() {
  return new Promise((resolve) => {
    console.log('🔧 Clearing port 5000...');
    
    exec('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :5000 ^| findstr LISTENING\') do taskkill /f /pid %a', (error) => {
      if (error) {
        console.log('✅ Port 5000 is already clear');
      } else {
        console.log('✅ Port 5000 cleared');
      }
      resolve();
    });
  });
}

// Start the server
async function startServer() {
  console.log('🚀 Starting estateLink Backend Server');
  console.log('=====================================');
  
  // Kill port 5000
  await killPort5000();
  
  // Wait a moment
  setTimeout(() => {
    console.log('🚀 Starting server on port 5000...');
    console.log('=====================================');
    
    // Start the actual server
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
    
  }, 1000);
}

startServer();
