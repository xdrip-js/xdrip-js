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

.controller('HomeController', ['$scope', '$interval', 'G5', function ($scope, $interval, G5) {
  $scope.glucose = function() {
    return G5.sensor.glucose();
  };

  // $scope.arrow = arrow($scope.glucose.trend);
  $scope.arrow = arrow(0);

  const tick = function() {
    if ($scope.glucose()) {
      $scope.age = (Date.now() - $scope.glucose().readDate) / 1000;
    }
  };
  tick();
  $interval(tick, 1000);

  function arrow(trend) {
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
  }
}]);
