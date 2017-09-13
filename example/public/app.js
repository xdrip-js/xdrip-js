angular.module('CGMApp', [
  'btford.socket-io'
]).
factory('transmitterSocket', function (socketFactory) {
  return socketFactory();
}).
controller('MyCtrl', ['$scope', 'transmitterSocket', function ($scope, transmitterSocket) {
  $scope.calibration = 100;

  transmitterSocket.on('glucose', function(glucose) {
    // simpler just to do $scope.glucose = glucose?
    $scope.inSession = (glucose.state !== 0x01) && (glucose.state !== 0x0b);
    $scope.canBeCalibrated = glucose.canBeCalibrated;
    $scope.transmitterAge = glucose.timeMessage.currentTime;
    $scope.sensorAge = ($scope.inSession) ?
      null :
      glucose.timeMessage.currentTime - glucose.timeMessage.sessionStartTime;
    $scope.time =  new Date(glucose.readDate);
    $scope.glucose = glucose.glucose;
    $scope.state = glucose.state;
    $scope.status = glucose.status;
    $scope.unfiltered = glucose.unfiltered;
  });

  $scope.startSensor = function() {
    console.log('in startSensor');
    transmitterSocket.emit('startSensor');
  };

  $scope.stopSensor = function() {
    console.log('in stopSensor');
    transmitterSocket.emit('stopSensor');
  };

  $scope.calibrate = function() {
    console.log('in calibrate');
    transmitterSocket.emit('calibrate', $scope.calibration);
  };

  transmitterSocket.on('id', function(value) {
    $scope.id = value;
  });
}]).
filter('time', function() {
  // TODO: handle singulars, as in
  // https://gist.github.com/lukevella/f23423170cb43e78c40b
  return function(seconds) {
    if (!seconds) return '--';
    if (seconds < 60) return seconds + ' seconds';
    else {
      const minutes = seconds / 60;
      if (minutes < 60) return minutes.toFixed(0) + ' minutes';
      else {
        const hours = minutes / 60;
        if (hours < 24) return hours.toFixed(0) + ' hours';
        else {
          const days = hours / 24;
          return days.toFixed(0) + ' days';
        }
      }
    }
    if (seconds < 60) return seconds + ' seconds';
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
     case 0x0b:
       return "Failed sensor";
     case 0x0c:
       return "???";
     default:
       return state ? "Unknown: 0x" + state.toString(16) : '--';
     }
  };
}).
filter('status', function() {
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
