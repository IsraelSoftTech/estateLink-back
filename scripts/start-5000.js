const { exec, spawn } = require('child_process');

// Kill processes on port 5000
console.log('🔧 Killing processes on port 5000...');
exec('for /f "tokens=5" %a in (\'netstat -aon ^| findstr :5000 ^| findstr LISTENING\') do taskkill /f /pid %a', (error) => {
  console.log('✅ Port 5000 cleared');
  
  // Kill all Node.js processes
  console.log('🔧 Killing Node.js processes...');
  exec('taskkill /f /im node.exe', (error) => {
    console.log('✅ Node.js processes cleared');
    
    // Start the server
    console.log('🚀 Starting server on port 5000...');
    console.log('=====================================');
    
    const server = spawn('node', ['index.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });
    
    server.on('error', (err) => {
      console.error('❌ Failed to start server:', err);
    });
    
    server.on('close', (code) => {
      console.log(`\n📋 Server exited with code ${code}`);
    });
  });
});
