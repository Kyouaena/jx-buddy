const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=%2F',{redirect:'manual'});
const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Local mock sign-in failed');
const response=await fetch(base+'/api/ifind',{headers:{cookie}});
console.log(JSON.stringify({status:response.status,...await response.json()}));
if(!response.ok)process.exitCode=1;
