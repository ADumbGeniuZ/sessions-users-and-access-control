const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const saltRounds = 10;

// we set the db global because we only want one mongoose connection and instance across the application 
global.mongoose = require('mongoose'); 
mongoose.connect('mongodb://localhost/session_auth_and_acl');
mongoose.connection.on('error', (e)=>{ console.error(e); });
mongoose.connection.once('open', ()=>{ console.info('db connected');});

// Create an Express app
const app = express();

// Sessions, Users and Access control middleware
const AccessManager = require('./access-manager');
const accessManager = new AccessManager({
  mongoose: mongoose,
  expressApp: app,
  aclImport:{
    file: '', // a valid file path, if left empty, example data will be used if import is run
    run: process.argv.includes('--import-acl-from-json') // $ node app --import-acl-from-json
  } 
});

// User model
const User = accessManager.models.user;

// Register middleware
app.use(bodyParser.json()) // needed to post json

// Register routes
app.get('/', (req, res)=>{
  res.json(req.method);
});

app.post('/register', async (req, res)=>{
  // encrypt password
  req.body.password = await bcrypt.hash(req.body.password, saltRounds);
  // create user
  let user = await new User(req.body);
  await user.save();
  // confirm registration (but not the password)
  user.password = '******';
  res.json(user);
});

app.get('/user', (req, res)=>{
  // check if there is a logged-in user and return that user
  let response;
  if(req.user._id){
    response = req.user;
    // never send the password back
    response.password = '******';
  }else{
    response = {message: 'Not logged in'};
  }
  res.json(response);
});

app.post('/login', async (req, res)=>{
  // create login from user
  let response = {message: 'Bad credentials'}; // default
  if(req.user._id){
    response = {message: 'Already logged in'};
  }else{
    // encrypt
    let user = await User.findOne({email: req.body.email});
    if(user){
      let passwordsMatch = await bcrypt.compare(req.body.password, user.password);
      if(passwordsMatch){
        req.session.user = user._id;
        req.session.loggedIn = true;
        await req.session.save(); // save the userId and login to the session
        // below to avoid sending the password to the client
        user.password = '******';
        response = {message: 'Logged in', user: user};
      }
    }
  } 
  res.json(response);
});

app.all('/logout', async (req, res)=>{ // we are supposed to do delete login, but I guess any method asking for logout is fine too
  // instead of destroying the session (which works and is a normal procedure)
  //  we opt to remove the login, but keep the session
  req.user = {};
  req.session.loggedIn = false; 
  let result = await req.session.save();
  res.json({message: 'Logged out', session: req.session, user: req.user});
});

// any possible routes (with any method) that we have not already defined (so we can test the ACL)
app.all('*', (req, res)=>{
  res.json({params: req.params, body: req.body}); // just return some debugging, the ACL block happens in the ACL module
});

// Start the Express app on port 3000
app.listen(3000,()=>{
  console.log("Mystery Science Theatre 3000!");
});