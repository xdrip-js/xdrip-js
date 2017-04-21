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
    $scope.sensorAge = glucose.timeMessage.sessionStartTime;
    $scope.time =  new Date(glucose.readDate);
    $scope.glucose = glucose.glucose;
    $scope.state = glucose.state;
  });
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
       break;
     case 2:
       return "Warmup";
       break;
     case 4:
       return "First calibration";
       break;
     case 5:
       return "Second calibration";
       break;
     case 6:
       return "OK";
       break;
     case 7:
       return "Need calibration";
       break;
     default:
       return "--";
     }
  };
});
