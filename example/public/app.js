angular.module('CGMApp', [
  'btford.socket-io'
]).
factory('transmitterSocket', function (socketFactory) {
  return socketFactory();
}).
controller('MyCtrl', ['$scope', 'transmitterSocket', function ($scope, transmitterSocket) {
  transmitterSocket.on('glucose', function(glucose) {
    $scope.transmitterAge = glucose.timeMessage.currentTime;
    $scope.sensorAge = glucose.timeMessage.sessionStartTime;
    $scope.time =  new Date(glucose.readDate);
    $scope.glucose = glucose.glucose;
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
});
