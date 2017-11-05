angular.module('AngularOpenAPS.transmitter', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/settings/transmitter', {
    templateUrl: 'transmitter/transmitter.html',
    controller: 'TransmitterController'
  });
})

.controller('TransmitterController', ['$scope', '$interval', 'G5', function ($scope, $interval, G5) {
  $scope.status = 0x81;
  $scope.transmitter = G5.transmitter;

  const tick = function() {
    if ($scope.transmitter) {
      $scope.age = (Date.now() - $scope.transmitter.activationDate) / 1000;
    }
  };
  tick()
  $interval(tick, 1000);

  $scope.setID = function(id) {
    G5.setID(id);
  };
}])

.filter('status', function() {
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
