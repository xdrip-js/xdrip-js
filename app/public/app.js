'use strict';

var app = angular.module('AngularOpenAPS', [
  'ngRoute',
  // 'ngTouch',
  'mobile-angular-ui',
  'btford.socket-io',
  'chart.js'
])

app.config(function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider.when('/', {templateUrl: 'home.html', reloadOnSearch: false});
  $routeProvider.when('/settings', {templateUrl: 'settings.html', reloadOnSearch: false});
  $routeProvider.when('/settings/transmitter', {templateUrl: 'transmitter.html', reloadOnSearch: false});
  $routeProvider.when('/settings/info', {templateUrl: 'info.html', reloadOnSearch: false});
  $routeProvider.when('/calibrate', {templateUrl: 'calibrate.html', reloadOnSearch: false});
  $routeProvider.when('/pair', {templateUrl: 'pair.html', reloadOnSearch: false});
  $routeProvider.when('/stop', {templateUrl: 'stop.html', reloadOnSearch: false});
  $routeProvider.when('/pending', {templateUrl: 'pending.html', reloadOnSearch: false});
})

app.factory('transmitterSocket', function (socketFactory) {
  return socketFactory();
})

app.controller('MyCtrl', ['$scope', '$interval', 'transmitterSocket', function ($scope, $interval, transmitterSocket) {
//  $scope.calibration = {};

  transmitterSocket.on('version', version => {
    console.log("got version " + version);
    $scope.version = version;
  });

  transmitterSocket.on('glucose', function(glucose) {
    $scope.glucose = glucose;

    // the old way: left here temporarily for reference
    // $scope.inSession = (glucose.state !== 0x01) && (glucose.state !== 0x0b);
    // $scope.canBeCalibrated = glucose.canBeCalibrated;
    // $scope.transmitterAge = glucose.timeMessage.currentTime;
    // $scope.sensorAge = ($scope.inSession) ?
    //   glucose.timeMessage.currentTime - glucose.timeMessage.sessionStartTime :
    //   null;
    // $scope.time =  new Date(glucose.readDate);
    // $scope.glucose = glucose.glucose;
    // $scope.state = glucose.state;
    // $scope.status = glucose.status;
    // $scope.unfiltered = glucose.unfiltered;
  });

  transmitterSocket.on('calibration', function(calibration) {
    console.log("got calibration " + calibration.glucose);
    $scope.calibration = calibration;
  });

  const tick = function() {
    $scope.glucose.age = (Date.now() - $scope.glucose.readDate) / 1000;
    $scope.glucose.sensorAge = $scope.glucose.inSession ? (Date.now() - $scope.glucose.sessionStartDate) / 1000 : null;
    $scope.glucose.transmitterAge = (Date.now() - $scope.glucose.transmitterStartDate) / 1000;
  }
  $interval(tick, 1000);

  $scope.inSession = function() {
    const state = $scope.glucose.state;
    return (state !== 0x01) && (state !== 0x0b);
  }

  $scope.startSensor = function() {
    console.log('in startSensor');
    transmitterSocket.emit('startSensor');
  };

  $scope.stopSensor = function() {
    console.log('in stopSensor');
    transmitterSocket.emit('stopSensor');
  };

  $scope.calibrate = function(value) {
    console.log('in calibrate');
    transmitterSocket.emit('calibrate', value);
  };

  $scope.setID = function(id) {
    console.log('setting id to ' + id);
    transmitterSocket.emit('id', id);
  }

  transmitterSocket.on('id', function(value) {
    $scope.id = value;
  });

  // for demo chart
  $scope.labels = ["January", "February", "March", "April", "May", "June", "July"];
  $scope.series = ['Series A', 'Series B'];
  $scope.data = [
    [65, 59, 80, 81, 56, 55, 40]
    // [28, 48, 40, 19, 86, 27, 90]
  ];
  // $scope.onClick = function (points, evt) {
  //   console.log(points, evt);
  // };
  // $scope.datasetOverride = [{ yAxisID: 'y-axis-1' }, { yAxisID: 'y-axis-2' }];
  $scope.options = {
    scales: {
      yAxes: [
        {
          id: 'y-axis-1',
          type: 'linear',
          display: true,
          position: 'left'
        },
        {
          id: 'y-axis-2',
          type: 'linear',
          display: true,
          position: 'right'
        }
      ]
    }
  };
}])

app.filter('time', function() {
  // TODO: handle singulars, as in
  // https://gist.github.com/lukevella/f23423170cb43e78c40b
  return function(seconds) {
    if (!seconds) return '--';
    if (seconds < 60) return seconds + ' seconds';
    else {
      const minutes = seconds / 60;
      if (minutes < 60) return minutes.toFixed(0) + ' minutes';
      else {
        const hours = minutes / 60;
        if (hours < 24) return hours.toFixed(0) + ' hours';
        else {
          const days = hours / 24;
          return days.toFixed(0) + ' days';
        }
      }
    }
    if (seconds < 60) return seconds + ' seconds';
    return seconds ? (seconds / 60 / 60 / 24).toFixed(1) + ' days' : '--';
  };
})

app.filter('mg_per_dl', function() {
  return function(glucose) {
    return glucose ? glucose + ' mg/dl' : '--';
  };
})

app.filter('mmol_per_L', function() {
  return function(glucose) {
    return glucose ? (glucose/18).toFixed(1) + ' mmol/L' : '--';
  };
})

app.filter('state', function() {
  return function(state) {
//   let formatted;
   switch (state) {
     case 0x01:
       return "Stopped";
     case 0x02:
       return "Warmup";
     case 0x04:
       return "First calibration";
     case 0x05:
       return "Second calibration";
     case 0x06:
       return "OK";
     case 0x07:
       return "Need calibration";
     case 0x0a:
       return "Enter new BG meter value";
     case 0x0b:
       return "Failed sensor";
     case 0x0c:
       return "???";
     default:
       return state ? "Unknown: 0x" + state.toString(16) : '--';
     }
  };
})

app.filter('status', function() {
  return function(status) {
   switch (status) {
     case null:
      return '--';
     case 0x00:
       return "OK";
     case 0x81:
       return "Low battery";
     case 0x83:
       return "Bricked";
     default:
       return status ? "Unknown: 0x" + status.toString(16) : '--';
     }
  };
});
