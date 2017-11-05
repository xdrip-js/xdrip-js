// TODO: I reckon this can live inside sensor. There's not much in here

angular.module('AngularOpenAPS.calibrate', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/calibrate', {
    templateUrl: 'calibrate/calibrate.html',
    controller: 'CalibrateController'
  });
})

.controller('CalibrateController', function ($scope, transmitterSocket) {
  $scope.calibrate = function(value) {
    console.log('in calibrate');
    transmitterSocket.emit('calibrate', value);
  };
});


// this is from the old controller. not sure about it
//   transmitterSocket.on('calibration', function(calibration) {
//     console.log("got calibration " + calibration.glucose);
//     $scope.calibration = calibration;
//   });
