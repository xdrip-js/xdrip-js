angular.module('AngularOpenAPS.cgm.transmitter', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/cgm/transmitter', {
    templateUrl: 'cgm/transmitter/transmitter.html',
    controller: 'TransmitterController'
  });
  $routeProvider.when('/cgm/transmitter/pair', {
    templateUrl: 'cgm/transmitter/pair.html',
    controller: 'TransmitterController'
  });
})

.controller('TransmitterController', ['$scope', 'G5', function ($scope, G5) {

  // TODO: an alternative to the following is something like
  // $scope.transmitter = G5.transmitter;
  // and then accessing transmitter functions using dot notation
  $scope.id = function() {
    return G5.transmitter.id;
  }

  $scope.age = function() {
    return G5.transmitter.age();
  }

  $scope.status = function() {
    return G5.transmitter.status();
  }

  $scope.setID = function(id) {
    G5.transmitter.id = id;
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
