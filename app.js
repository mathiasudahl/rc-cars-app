/***
 * https://github.com/zeit/pkg
 *
 */

let express = require("express"),
    http = require("http"),
    path = require("path"),
    fs = require("fs"),
    cookieParser = require("cookie-parser"),
    app = express(),
    server = http.createServer(app),
    io = require('socket.io')(server),
    UnityHandler = require("./unityHandler")(),
    config = require("./config");

server.listen(config.Server_Port, config.Server_IP);
UnityHandler.setSocketIO(io);
app.use(cookieParser());

let computer = null;
let mobiles = [];
let gameIsUnity = checkIfUnity(config.Path_To_Game);
let controllerIsUnity = checkIfUnity(config.Path_To_Controller);

let rootAssetsFolder = "";
let rootGameFolder = "";
let rootControllerFolder = "";

setRootFolders();

console.log("*********** Tiltspot Game Tester ***************");
console.log("   The Tiltspot Game Tester is now running!");
console.log("   Go to "+config.Server_IP+":"+config.Server_Port+" in your browser.");
console.log("**************** HAPPY TESTING *****************");

/****
 * Server Responses
 ****/

app.get('/', function (req, res) {
    if(checkIfMobileDevice(req.headers['user-agent'])){
        res.sendFile('src/mobile/index.html', {root: path.join(__dirname, './')});
    }else{
        res.sendFile('src/computer/index.html', {root: path.join(__dirname, './')});
    }
});

app.get('/bundle_computer.js', function (req, res) {
    res.sendFile('src/computer/bundle_computer.js', {root: path.join(__dirname, './')});
});

app.get('/bundle_mobile.js', function (req, res) {
    res.sendFile('src/mobile/bundle_mobile.js', {root: path.join(__dirname, './')});
});

app.get('/assets/*', function (req, res) {
    res.sendFile(config.Path_To_Assets+"/"+req.originalUrl.slice(8));
});

app.get('/game/*', function (req, res) {
    res.sendFile(config.Path_To_Game+"/"+req.originalUrl.slice(6));
});

app.get('/controller/*', function (req, res) {
    res.sendFile(config.Path_To_Controller+"/"+req.originalUrl.slice(12));
});

app.get('/'+rootAssetsFolder+'/*', function (req, res) {
    res.sendFile(config.Path_To_Assets+"/"+req.originalUrl.split(rootAssetsFolder+"/")[1]);
});

app.get('/'+rootGameFolder+'/*', function (req, res) {
    res.sendFile(config.Path_To_Game+"/"+req.originalUrl.split(rootGameFolder+"/")[1]);
});

app.get('/'+rootControllerFolder+'/*', function (req, res) {
    res.sendFile(config.Path_To_Controller+"/"+req.originalUrl.split(rootControllerFolder+"/")[1]);
});

app.get('/Build/*', function (req, res) {
    if(req.cookies.device === "computer"){
        res.sendFile(config.Path_To_Game+"/"+req.originalUrl);
    }
});

app.get('/TemplateData/*', function (req, res) {
    if(req.cookies.device === "computer"){
        res.sendFile(config.Path_To_Game+"/"+req.originalUrl);
    }
});

app.get('/gameHTML', function (req, res) {
    if(gameIsUnity) res.sendFile('src/unity/unity_index_game.html', {root: path.join(__dirname, './')});
    else{
        res.sendFile(config.Path_To_Game+"/index.html");
    }
});

app.get('/controllerHTML', function (req, res) {
    if(controllerIsUnity) res.sendFile('src/unity/unity_index_controller.html', {root: path.join(__dirname, './')});
    else res.sendFile(config.Path_To_Controller+"/index.html");
});

app.get('/*', function (req, res) {
    res.sendFile('./'+req.originalUrl, {root: path.join(__dirname, './')});
});



/****
 * Communication
 *
 * connectionResponses: 1: connected, 2: No computer, 3: In game
 ****/

io.sockets.on('connection', function (socket) {

    socket.on('init', function(isMobile){
        initSocket(socket, isMobile);
    });

    socket.on('msgToMobile', function (sId, msg, data) {
        io.to(sId).emit("msgToMobile", msg, data);
    });

    socket.on('msgToController', function (sId, msg, data) {
        io.to(sId).emit("msgToController", msg, data);
    });

    socket.on('msgToComputer', function (msg, data) {
        if(computer){
            io.to(computer.id).emit("msgToComputer", socket.id, msg, data);
        }
    });

    socket.on('msgToGame', function (msg, data) {
        if(computer){
            io.to(computer.id).emit("msgToGame", socket.id, msg, data);
        }
    });

    socket.on('msgToServer', function(msg, data){
        handleMsgToServer(msg, data);
    });

    socket.on('msgToUnity', function (msg, data) {
        console.log("msgToUnity", msg, data);
         switch (msg) {
             case "controllersReady":
                 UnityHandler.controllersReady(data);
                 break;
         }
    });

    socket.on('disconnect', function () {
        if (computer !== null && socket.id === computer.id) {
            computer = null;
            UnityHandler.reset();
            for (let i = 0; i < mobiles.length; i++) {
                io.to(mobiles[i].id).emit("computerDisconnected");
            }
        } else {
            for (let i = 0; i < mobiles.length; i++) {
                if (socket.id === mobiles[i].id) {
                    mobiles.splice(i, 1);
                    if (computer !== null){
                        UnityHandler.onMobileDisconnect(socket.id);
                        io.to(computer.id).emit("mobileDisconnect", {sId: socket.id});
                    }
                }
            }
        }
    });

});

function initSocket(socket, isMobile) {
    if(isMobile){
        mobiles.push(socket);
        io.to(socket.id).emit("init", {
            computerConnected: !!computer
        })
    }else{
        computer = socket;
        UnityHandler.setComputer(socket);
        io.to(socket.id).emit("init", {
            gamePath: config.Path_To_Game,
            controllerPath: config.Path_To_Controller,
            assetsPath: config.Path_To_Assets,
            unityPort: config.Unity_Port,
            gameIsUnity: gameIsUnity,
        });
        for(let i=0; i<mobiles.length; i++){
            io.to(mobiles[i].id).emit("computerConnected");
        }
    }
}

/**********
 * Handle server messages
 *********/
function handleMsgToServer(msg, data) {
    switch (msg) {
        case "useUnity":
            UnityHandler.setActive(data);
            break;
        case "msgToUnity":
            UnityHandler.sendMsg(data.id, data.msg, data.data);
            break;
        case "controllerDisconnect":
            UnityHandler.onMobileDisconnect(data);
            break;
        case "controllerConnect":
            UnityHandler.onMobileConnect(data);
            break;
        case "controllerReconnect":
            UnityHandler.onMobileReconnect(data);
            break;
    }
}

/****
 * Functions
 ****/

function getMobileIdBySId(sId) {
    for(let i=0; i<mobiles.length; i++){
        if(mobiles[i].id === sId) return i;
    }
}

function setRootFolders() {
    if(config.Path_To_Assets.indexOf("\\") !== -1){
        rootAssetsFolder = config.Path_To_Assets.replace(new RegExp("\\\\", 'g'), "/").split("/");
    }else rootAssetsFolder = config.Path_To_Assets.split("/");

    if(config.Path_To_Game.indexOf("\\") !== -1){
        rootGameFolder = config.Path_To_Game.replace(new RegExp("\\\\", 'g'), "/").split("/");
    }else rootGameFolder = config.Path_To_Game.split("/");

    if(config.Path_To_Controller.indexOf("\\") !== -1){
        rootControllerFolder = config.Path_To_Controller.replace(new RegExp("\\\\", 'g'), "/").split("/");
    }else rootControllerFolder = config.Path_To_Controller.split("/");

    rootAssetsFolder = rootAssetsFolder.pop() || rootAssetsFolder.pop();
    rootGameFolder = rootGameFolder.pop() || rootGameFolder.pop();
    rootControllerFolder = rootControllerFolder.pop() || rootControllerFolder.pop();
}

function checkIfMobileDevice(userAgent) {
    let ua;
    try{
        ua = userAgent.toLowerCase();
    }catch (e){return false;}
    return !!(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|ipad|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(ua) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(ua.substr(0, 4)));
}

function checkIfUnity(url) {
    return fs.existsSync(url+"/Build") && fs.existsSync(url+"/Build/UnityLoader.js");
}