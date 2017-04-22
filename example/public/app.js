angular.module('CGMApp', [
  'btford.socket-io'
]).
factory('transmitterSocket', function (socketFactory) {
  return socketFactory();
}).
controller('MyCtrl', ['$scope', 'transmitterSocket', function ($scope, transmitterSocket) {
  transmitterSocket.on('glucose', function(glucose) {
    // simpler just to do $scope.glucose = glucose?
    $scope.transmitterAge = glucose.timeMessage.currentTime;
    $scope.sensorAge = glucose.timeMessage.currentTime - glucose.timeMessage.sessionStartTime;
    $scope.time =  new Date(glucose.readDate);
    $scope.glucose = glucose.glucose;
    $scope.state = glucose.state;
  });

  $scope.startstop = function() {
    console.log('in startstop');
  };

  $scope.calibrate = function() {
    console.log('in calibrate');
    transmitterSocket.emit('calibrate', 100);
  };

  transmitterSocket.on('id', function(value) {
    $scope.id = value;
  });
}]).
filter('days', function() {
 return function(seconds) {
    return seconds ? (seconds / 60 / 60 / 24).toFixed(1) + ' days' : '--';
  };
}).
filter('mg_per_dl', function() {
 return function(glucose) {
    return glucose ? glucose + ' mg/dl' : '--';
  };
}).
filter('mmol_per_L', function() {
 return function(glucose) {
    return glucose ? (glucose/18).toFixed(1) + ' mmol/L' : '--';
  };
}).
filter('state', function() {
 return function(state) {
//   let formatted;
   switch (state) {
     case 1:
       return "Stopped";
     case 2:
       return "Warmup";
     case 4:
       return "First calibration";
     case 5:
       return "Second calibration";
     case 6:
       return "OK";
     case 7:
       return "Need calibration";
     case 0x12:
       return "???";
     default:
       return "--";
     }
  };
});
