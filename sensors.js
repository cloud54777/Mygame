import { CONFIG } from "./config.js";

export class SensorSystem {
    constructor(intersection) {
        this.intersection = intersection;
        this.detectorDistance = CONFIG.DEFAULT_SETTINGS.DETECTOR_DISTANCE;
        this.sensorData = {};
        this.carCounts = {};
        this.waitingCars = {};
        this.totalCarsDetected = {};
        
        this.initializeSensors();
    }

    initializeSensors() {
        // Initialize sensor data for each direction
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.sensorData[direction] = {
                carsWaiting: 0,
                waitTime: 0,
                detectedCars: [],
                firstCarWaitStart: null,
                totalCarsDetected: 0
            };
            this.carCounts[direction] = 0;
            this.waitingCars[direction] = null;
            this.totalCarsDetected[direction] = 0;
        });
    }

    initialize(detectorDistance) {
        this.detectorDistance = detectorDistance;
        this.initializeSensors();
    }

    update(cars, lightStates, prevLightStates) {
        // Reset detection data but keep total counts
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.sensorData[direction].carsWaiting = 0;
            this.sensorData[direction].waitTime = 0;
            this.sensorData[direction].detectedCars = [];
            // DON'T reset firstCarWaitStart - keep tracking wait time
            this.waitingCars[direction] = null;
        });

        // Process each car according to user specifications
        cars.forEach(car => {
            const direction = car.getDirection();
            const detectionZone = this.getDetectionZone(direction);
            const inDetectionZone = this.isCarInDetectionZone(car, detectionZone);
            const isAtStopLine = this.isCarAtStopLine(car, direction);

            // COUNT CARS ENTERING DETECTOR REGION (for both green and red lights)
            if (!car._countedInDetector && inDetectionZone) {
                car._countedInDetector = true;
                this.totalCarsDetected[direction]++;
                this.sensorData[direction].totalCarsDetected = this.totalCarsDetected[direction];
                console.log(`🚗 CAR DETECTED: ${direction.toUpperCase()} (Total: ${this.totalCarsDetected[direction]}) - TRIGGERS ADAPTIVE SYSTEM!`);
            }
            if (!inDetectionZone && car._countedInDetector) {
                car._countedInDetector = false;
            }

            // SPECIAL CASE: For initial startup (all lights red), count ALL detected cars
            const allLightsRed = !lightStates || Object.values(lightStates).every(state => state === CONFIG.LIGHT_STATES.RED);
            
            if (allLightsRed && inDetectionZone) {
                // During startup, add detected cars to trigger first green light
                this.sensorData[direction].detectedCars.push(car);
                if (!this.sensorData[direction].carsWaiting) {
                    this.sensorData[direction].carsWaiting = 0;
                }
                this.sensorData[direction].carsWaiting++;
                console.log(`🚦 STARTUP DETECTION: ${direction.toUpperCase()} has ${this.sensorData[direction].carsWaiting} cars - Ready to trigger green!`);
            }

            // FOR RED LIGHTS: Special handling for waiting cars
            else if (lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.RED) {
                if (inDetectionZone) {
                    this.sensorData[direction].detectedCars.push(car);
                }
                
                // Count cars waiting at red light
                if (car.isWaiting() && inDetectionZone) {
                    this.sensorData[direction].carsWaiting++;
                    
                    // Find first car (closest to stop line)
                    if (!this.waitingCars[direction] || this.isCarCloserToStopLine(car, this.waitingCars[direction], direction)) {
                        this.waitingCars[direction] = car;
                    }
                }

                // START TIMER when first car reaches stop line  
                if (isAtStopLine && car.isWaiting() && !this.sensorData[direction].firstCarWaitStart) {
                    this.sensorData[direction].firstCarWaitStart = Date.now();
                    console.log(`🚨 WAIT TIMER STARTED: ${direction.toUpperCase()} - First car reached stop line at red light!`);
                    console.log(`⏰ ${direction.toUpperCase()} WAIT TIMER: 0s - STARTING NOW!`);
                }
            }

            // FOR GREEN LIGHTS: Just count cars entering detector
            if (lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.GREEN) {
                if (inDetectionZone) {
                    this.sensorData[direction].detectedCars.push(car);
                }
            }
        });

        // Calculate wait times for display - UPDATE EVERY FRAME, SHOW EVERY SECOND
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            if (this.sensorData[direction].firstCarWaitStart) {
                const waitTime = Date.now() - this.sensorData[direction].firstCarWaitStart;
                this.sensorData[direction].waitTime = waitTime;
                
                // Display wait timer every second for red lights
                if (lightStates && lightStates[direction] === CONFIG.LIGHT_STATES.RED && waitTime > 0) {
                    const seconds = Math.floor(waitTime/1000);
                    // Show every second (when milliseconds are close to 0)
                    if (waitTime % 1000 < 100) { // Show every 1 second
                        console.log(`⏰ ${direction.toUpperCase()} WAIT TIMER: ${seconds}s (${this.sensorData[direction].carsWaiting} cars waiting)`);
                    }
                }
            }
        });
    }

    isCarAtStopLine(car, direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        const threshold = 15; // Distance threshold to consider "at stop line"
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return Math.abs(car.y - stopLine.y1) <= threshold;
            case CONFIG.DIRECTIONS.EAST:
                return Math.abs(car.x - stopLine.x1) <= threshold;
            case CONFIG.DIRECTIONS.SOUTH:
                return Math.abs(car.y - stopLine.y1) <= threshold;
            case CONFIG.DIRECTIONS.WEST:
                return Math.abs(car.x - stopLine.x1) <= threshold;
            default:
                return false;
        }
    }

    isCarCloserToStopLine(car1, car2, direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return Math.abs(car1.y - stopLine.y1) < Math.abs(car2.y - stopLine.y1);
            case CONFIG.DIRECTIONS.EAST:
                return Math.abs(car1.x - stopLine.x1) < Math.abs(car2.x - stopLine.x1);
            case CONFIG.DIRECTIONS.SOUTH:
                return Math.abs(car1.y - stopLine.y1) < Math.abs(car2.y - stopLine.y1);
            case CONFIG.DIRECTIONS.WEST:
                return Math.abs(car1.x - stopLine.x1) < Math.abs(car2.x - stopLine.x1);
            default:
                return false;
        }
    }

    getDetectionZone(direction) {
        const stopLine = this.intersection.getStopLinePosition(direction);
        const roadWidth = CONFIG.ROAD_WIDTH;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1 - this.detectorDistance,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1
                };
            case CONFIG.DIRECTIONS.EAST:
                return {
                    x1: stopLine.x1,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1 + this.detectorDistance,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            case CONFIG.DIRECTIONS.SOUTH:
                return {
                    x1: this.intersection.centerX - roadWidth / 2,
                    y1: stopLine.y1,
                    x2: this.intersection.centerX + roadWidth / 2,
                    y2: stopLine.y1 + this.detectorDistance
                };
            case CONFIG.DIRECTIONS.WEST:
                return {
                    x1: stopLine.x1 - this.detectorDistance,
                    y1: this.intersection.centerY - roadWidth / 2,
                    x2: stopLine.x1,
                    y2: this.intersection.centerY + roadWidth / 2
                };
            default:
                return { x1: 0, y1: 0, x2: 0, y2: 0 };
        }
    }

    isCarInDetectionZone(car, zone) {
        return (
            car.x >= zone.x1 &&
            car.x <= zone.x2 &&
            car.y >= zone.y1 &&
            car.y <= zone.y2
        );
    }

    render(ctx) {
        // Only render in adaptive mode
        if (!this.shouldRenderSensors()) return;

        // Render detection zones with translucent overlay
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.fillStyle = 'rgba(255, 165, 0, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            const zone = this.getDetectionZone(direction);
            
            // Fill detection zone
            ctx.fillRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Stroke detection zone border
            ctx.strokeRect(zone.x1, zone.y1, zone.x2 - zone.x1, zone.y2 - zone.y1);
            
            // Show total cars detected (white box)
            this.renderCarCount(ctx, direction, zone);
            
            // Show wait time for first waiting car (red box)
            this.renderWaitTime(ctx, direction, zone);
        });
        
        ctx.setLineDash([]);
    }

    shouldRenderSensors() {
        // Check if we're in adaptive mode by looking at the game engine
        // This is a simple check - in a real implementation you'd pass the mode
        return true; // For now, always render when called
    }

    renderCarCount(ctx, direction, zone) {
        const count = this.totalCarsDetected[direction] || 0;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x1 - 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x2 + 40;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 20;
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 30;
                break;
        }
        
        // Draw background box
        const text = count.toString();
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 10, 30);
        const boxHeight = 20;
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw count text
        ctx.fillStyle = '#333';
        ctx.fillText(text, textX, textY + 4);
        
        // Add direction label
        ctx.font = 'bold 10px Arial';
        ctx.fillText(direction.charAt(0).toUpperCase(), textX, textY - 15);
    }

    renderWaitTime(ctx, direction, zone) {
        const waitingCar = this.waitingCars[direction];
        if (!waitingCar) return;
        
        const waitTime = (waitingCar.getWaitTime() / 1000).toFixed(1);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        
        let textX, textY;
        
        switch (direction) {
            case CONFIG.DIRECTIONS.NORTH:
                textX = zone.x2 + 50;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.SOUTH:
                textX = zone.x1 - 50;
                textY = (zone.y1 + zone.y2) / 2;
                break;
            case CONFIG.DIRECTIONS.EAST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y2 + 50;
                break;
            case CONFIG.DIRECTIONS.WEST:
                textX = (zone.x1 + zone.x2) / 2;
                textY = zone.y1 - 40;
                break;
        }
        
        // Draw background box
        const text = `${waitTime}s`;
        const textWidth = ctx.measureText(text).width;
        const boxWidth = Math.max(textWidth + 8, 25);
        const boxHeight = 18;
        
        ctx.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        ctx.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
        
        // Draw wait time text
        ctx.fillStyle = '#ff4444';
        ctx.fillText(text, textX, textY + 3);
    }

    updateDetectorDistance(distance) {
        this.detectorDistance = distance;
    }

    getSensorData() {
        return { ...this.sensorData };
    }

    getCarCounts() {
        return { ...this.carCounts };
    }

    getTotalCarsDetected() {
        return { ...this.totalCarsDetected };
    }

    resetCarCount(direction) {
        this.totalCarsDetected[direction] = 0;
    }

    resetAllCarCounts() {
        Object.values(CONFIG.DIRECTIONS).forEach(direction => {
            this.totalCarsDetected[direction] = 0;
        });
        console.log('Adaptive Mode: Car counts reset for new cycle');
    }
    
    triggerCountReset() {
        this.shouldResetCounts = true;
    }

    reset() {
        this.initializeSensors();
    }
}