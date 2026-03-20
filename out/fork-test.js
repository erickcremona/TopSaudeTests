process.on('message',()=>{}); console.log('child started'); setTimeout(()=>process.exit(0), 200);
