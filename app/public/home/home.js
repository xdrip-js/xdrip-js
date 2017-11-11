angular.module('AngularOpenAPS.home', [
  'ngRoute',
  'ngSanitize'
])

.config(function($routeProvider) {
  $routeProvider.when('/', {
    templateUrl: 'home/home.html',
    controller: 'HomeController'
  });
})

.controller('HomeController', ['$scope', 'G5', function ($scope, G5) {
  $scope.glucose = function() {
    return G5.sensor.glucose();
  };

  $scope.arrow = function() {
    const trend = $scope.glucose().trend;
    if (trend <= -30) {
      return '&ddarr;'
    } else if (trend <= -20) {
      return '&darr;'
    } else if (trend <= -10) {
      return '&searr;'
    } else if (trend < 10) {
      return '&rarr;'
    } else if (trend < 20) {
      return '&nearr;'
    } else if (trend < 30) {
      return '&uarr;'
    } else {
      return '&uuarr;'
    }
  };
}]);
