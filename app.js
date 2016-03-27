/*
  REQUIRES
*/

var express = require("express"),
app = express(),
mongoose = require('mongoose'),
fs = require('fs'),
configurationFile = fs.readFileSync('configuration.json'),
configuration = JSON.parse(configurationFile),
mongoConnectionString = "mongodb://" + configuration.hostMongo + "/" + configuration.databaseMongo,
ToolObject = new Tool();


/*
  MYSQL CONNECTION
*/

var mysql      = require('mysql');
var mysqlConnection = mysql.createConnection({
  host     : configuration.hostMysql,
  user     : configuration.usernameMysql,
  password : configuration.passwordMysql,
  database : configuration.databaseMysql
});

console.log("CONNECTION TO MYSQL...");

mysqlConnection.connect();


/*
  MONGO DB CONNECTION
*/

mongoose.connect(mongoConnectionString, function(err) {
  console.log("CONNECTION TO MONGO...");
  if (err) { throw err; }
  console.log("CONNECTION OK");
});


/*
  SCHEMAS MONGO DB
*/

var messagesSchema = new mongoose.Schema({
  message_id : String,
  datetime : String,
  timestamp : String,
  author : String,
  message : String
});

var messagesModel = mongoose.model('messages', messagesSchema);


/*
  HEADER MIDDLEWARE
*/
app.use(function (req, res, next) {

    res.setHeader('Access-Control-Allow-Origin', configuration.allow_connect_socket);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-type, Content-Range, Content-Disposition, Content-Description');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    next();
});


/*
  VIEWS, SESSIONS AND ROUTES SETTINGS
*/

app.use(express.cookieParser());
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.bodyParser());
app.use(app.router);


/*
  TOOL OBJECT
*/

function Tool() {

    this.timeToHHMMSS = function () {

      var date = new Date();

      var hours = date.getHours();
      var minutes = date.getMinutes();
      var seconds = date.getSeconds();

        if (hours   < 10) {hours   = "0"+hours;}
        if (minutes < 10) {minutes = "0"+minutes;}
        if (seconds < 10) {seconds = "0"+seconds;}

        var time    = hours+':'+minutes+':'+seconds;

        return time;
    }

  this.generateUniqID = function() {
    return Math.random().toString(36).substr(2, 9);
  } 

  this.htmlspecialchars = function(str) {
    console.log(str);
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  this.htmlspecialchars_decode = function(str) {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
  }

  this.nl2br = function(str) {
    return str.replace(/\n/g, "<br>");
  }
};

/*
  STARTING SERVER
*/

var http = require("http");
var server = http.createServer(app);
var io = require('socket.io').listen(server);

server.listen(configuration.engine_port);


/*
  CHAT WEBSOCKETS
*/

io.sockets.on('connection', function (socket) {

    socket.on('is-writing', function(data){
      socket.broadcast.emit('is-writing', data);
    });

    socket.on('stop-writing', function(data){
      socket.broadcast.emit('stop-writing', data);
    });

    socket.on('get-messages', function(data){

      var query = messagesModel.find(null);
      query.limit(300);
      query.sort({timestamp : -1});
      query.exec(function (err, messages) {
        if (err) { throw err; }

        socket.emit('messages', messages);
        socket.broadcast.emit('messages', messages);

      });

    });

    socket.on('send-message', function(data){

      var messageData = {
        message_id : ToolObject.generateUniqID(),
        datetime : ToolObject.timeToHHMMSS(),
        timestamp : new Date().getTime(),
        author : data.author,
        message : data.message
      };

      var message = new messagesModel(messageData);

      message.save(function(err){
        if (err) {throw err};

        mysqlConnection.query('SELECT * FROM produits WHERE code = "' + ToolObject.htmlspecialchars(messageData.message) + '"', function(err, rows, fields) {
          if (err) throw err;

          if (rows.length > 0) {
            socket.emit('produit-a-monter', { produit : rows[0], author : data.author, datetime : ToolObject.timeToHHMMSS() });
            socket.broadcast.emit('produit-a-monter', { produit : rows[0], author : data.author, datetime : ToolObject.timeToHHMMSS() });  
            console.log("PRODUIT A MONTER !!" + { produit : rows[0], author : data.author, datetime : ToolObject.timeToHHMMSS() });

            var messageDataProduit = {
              message_id : ToolObject.generateUniqID(),
              datetime : ToolObject.timeToHHMMSS(),
              timestamp : new Date().getTime(),
              author : data.author,
              message : "Produit à monter ! /// CODE : " + rows[0].code + " /// TITRE : " + rows[0].titre + " /// AUTEUR : " + rows[0].auteur + " /// EDITEUR : " + rows[0].editeur
            };

            var message = new messagesModel(messageDataProduit);

            message.save(function(err){
              if (err) {throw err};
            });

          }
          else{
            socket.emit('message', messageData);
            socket.broadcast.emit('message', messageData);
          }

        });
      });

    });

});

console.log("APP STARTED");