angular.module('AngularOpenAPS.cgm', [
  'ngRoute',
  'AngularOpenAPS.cgm.transmitter',
  'AngularOpenAPS.cgm.sensor'
])

.config(function($routeProvider) {
  $routeProvider.when('/cgm', {
    templateUrl: 'cgm/cgm.html'//,
    // controller: 'SensorController'
  });
})

// .controller('SensorController', ['$scope', 'G5', function ($scope, G5) {
//   $scope.sensor = G5.sensor;
//   $scope.insertionDate = Date.now() - 5*24*60*60*1000;
//   // $scope.state = 0x0a;
//
//   $scope.age = function() {
//     return G5.sensor.age();
//   }
//
//   $scope.state = function() {
//     return G5.sensor.state();
//   }
//
//   $scope.start = function() {
//     G5.start();
//   };
//
//   $scope.stop = function() {
//     G5.stop();
//   };
// }])
//
// .filter('state', function() {
//   return function(state) {
//    switch (state) {
//      case 0x01:
//        return "Stopped";
//      case 0x02:
//        return "Warmup";
//      case 0x04:
//        return "First calibration";
//      case 0x05:
//        return "Second calibration";
//      case 0x06:
//        return "OK";
//      case 0x07:
//        return "Need calibration";
//      case 0x0a:
//        return "Enter new BG meter value";
//      case 0x0b:
//        return "Failed sensor";
//      case 0x0c:
//        return "???";
//      default:
//        return state ? "Unknown: 0x" + state.toString(16) : '--';
//      }
//   };
// });
