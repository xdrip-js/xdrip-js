angular.module('AngularOpenAPS.sensor', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/settings/sensor', {
    templateUrl: 'sensor/sensor.html',
    controller: 'SensorController'
  });
  $routeProvider.when('/sensor/calibration', {
    templateUrl: 'sensor/calibration.html',
    controller: 'SensorController'
  });
})

.controller('SensorController', ['$scope', '$interval', 'G5', function ($scope, $interval, G5) {
  $scope.sensor = G5.sensor;
  $scope.insertionDate = Date.now() - 5*24*60*60*1000;
  // $scope.state = 0x0a;

  $scope.age = function() {
    return G5.sensor.age();
  }

  $scope.state = function() {
    return G5.sensor.state();
  }

  // const tick = function() {
  //   if ($scope.sensor) {
  //     $scope.age = (Date.now() - $scope.sensor.insertionDate) / 1000;
  //   }
  // };
  // tick()
  // $interval(tick, 1000);

  $scope.start = function() {
    G5.start();
  };

  $scope.stop = function() {
    G5.stop();
  };
}])

.filter('state', function() {
  return function(state) {
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
});
