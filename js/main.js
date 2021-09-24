fetch("./json/stars.json").then(response => response.json()).then(data => new Simulator(data));

function Simulator({stars: catalogue, constellations, minMag, maxMag}) {
    const EARTH_INCLINATION = 23.4;
    const MIN_SIZE = 1;
    const MAX_SIZE = 3;
    const FIXED_DISTANCE = 100;
    const DISTANCE_MULTIPLIER = 1.5;
    const STAR_SPEED = 1;

    let scene;
    let camera;
    let renderer;
    let controls;

    let stars;
    let constellationLines;
    let constellationBoundaries;

    let moveForward = false;
    let moveBackward = false;
    let moveLeft = false;
    let moveRight = false;
    let showFixedStars = true;
    let isMoving = false;

    let starsGeometry;
    let constellationLinesGeometry;

    let prevTime = performance.now();
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const pointing = new THREE.Vector3();

    const raSpan = document.querySelector("#ra");
    const decSpan = document.querySelector("#dec");

    const init = () => {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        controls = new PointerLockControls(camera, document.body);
        scene.add(controls.getObject());

        renderer = new THREE.WebGLRenderer({antialias: true});
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
            
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        document.addEventListener('keypress', onKeyPress);
        window.addEventListener('resize', onWindowResize);
        const blocker = document.getElementById('blocker');
        const instructions = document.getElementById('instructions');
        instructions.addEventListener('click', () => controls.lock());
        controls.addEventListener('lock', () => {
            instructions.style.display = 'none';
            blocker.style.display = 'none';
        });
        controls.addEventListener('unlock', () => {
            blocker.style.display = 'block';
            instructions.style.display = '';
        });

        const [raText, decText] = transformToRADEC(controls.getDirection(pointing));
        raSpan.textContent = raText;
        decSpan.textContent = decText;


        placeElements();
        animate();
    }

    function vertexShader() {
        return `
            attribute float size;
            attribute vec4 color;
            varying vec4 vColor;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                gl_PointSize = size * ( 250.0 / -mvPosition.z );
                gl_Position = projectionMatrix * mvPosition;
            }
        `}
    
    function fragmentShader() {
        return `
            varying vec4 vColor;
                void main() {
                    gl_FragColor = vec4( vColor );
                }
        `}

    const placeElements = () => {
        const starPositions = [];
        const starSizes = [];
        const starColors = [];
        const linesPoints = [];
        const boundariesPoints = [];
        const color = new THREE.Color();

        for(let c = 0; c < constellations.length; c++) {
            const constellation = constellations[c];
            for(let p = 0; p < constellation.boundary.length - 1; p++) {
                const point = constellation.boundary[p];
                const next = constellation.boundary[p + 1];
                boundariesPoints.push(new THREE.Vector3().setFromSphericalCoords(150, point.dec * Math.PI / 180, point.ra * Math.PI / 180));
                boundariesPoints.push(new THREE.Vector3().setFromSphericalCoords(150, next.dec * Math.PI / 180, next.ra * Math.PI / 180));
            };
            const point = constellation.boundary[constellation.boundary.length - 1];
            const next = constellation.boundary[0];
            boundariesPoints.push(new THREE.Vector3().setFromSphericalCoords(150, point.dec * Math.PI / 180, point.ra * Math.PI / 180));
            boundariesPoints.push(new THREE.Vector3().setFromSphericalCoords(150, next.dec * Math.PI / 180, next.ra * Math.PI / 180));

            for(let i = 0; i < constellation.stars.length; i++) {
                const starHR = constellation.stars[i];
                const star = catalogue[starHR];
                const {ra, dec, vis_mag, dist, class: starClass, connectsTo} = star;

                star.relativePosition = star.relativePosition ? star.relativePosition : transformCoords(ra, dec, dist);
                star.fixedPosition = star.fixedPosition ? star.fixedPosition : transformCoords(ra, dec, FIXED_DISTANCE);
                star.currentDist = showFixedStars ? FIXED_DISTANCE : star.dist;

                const currentPosition = star.currentPosition ? star.currentPosition : showFixedStars ? star.fixedPosition.clone() : star.relativePosition.clone();
                star.currentPosition = currentPosition;
                starPositions.push(currentPosition.x);
                starPositions.push(currentPosition.y);
                starPositions.push(currentPosition.z);

                if(connectsTo) {
                    connectsTo.map(destination => {
                        // if(catalogue[destination]){
                        linesPoints.push(currentPosition);
                        if(catalogue[destination].currentPosition) {
                            linesPoints.push(catalogue[destination].currentPosition);
                        } else {
                            const {ra: destRa, dec: destDec, dist: destDist} = catalogue[destination];
                            const destPos = transformCoords(destRa, destDec, showFixedStars ? FIXED_DISTANCE : destDist);
                            linesPoints.push(destPos);
                            catalogue[destination].currentPosition = destPos;
                        }
                        // }
                    });
                }

                const size = calculateSize(vis_mag);
                starSizes.push(size);

                if(starClass.startsWith("O")) {
                    color.setHex(0x91b5ff);
                } else if(starClass.startsWith("B")) {
                    color.setHex(0xa7c3ff);
                } else if(starClass.startsWith("A")) {
                    color.setHex(0xd0ddff);
                } else if(starClass.startsWith("F")) {
                    color.setHex(0xf1f1fd);
                } else if(starClass.startsWith("G")) {
                    color.setHex(0xfdefe7);
                } else if(starClass.startsWith("K")) {
                    color.setHex(0xffddbb);
                } else if(starClass.startsWith("M")) {
                    color.setHex(0xffb466);
                } else if(starClass.startsWith("L")) {
                    color.setHex(0xff820e);
                } else if(starClass.startsWith("T")) {
                    color.setHex(0xff3a00);
                } else {
                    color.setHex(0xffffff);
                }                        
                starColors.push(color.r, color.g, color.b, 255);
            }
        }

        
        constellationLinesGeometry = new THREE.BufferGeometry().setFromPoints(linesPoints);
        const constellationLinesMaterial = new THREE.LineBasicMaterial({color: 0xff0000});
        constellationLines = new THREE.LineSegments(constellationLinesGeometry, constellationLinesMaterial);
        scene.add(constellationLines);

        const boundariesGeometry = new THREE.BufferGeometry().setFromPoints(boundariesPoints);
        const boundariesMaterial = new THREE.LineDashedMaterial({color: 0xffff00, dashSize: 1});
        constellationBoundaries = new THREE.LineSegments(boundariesGeometry, boundariesMaterial);
        constellationBoundaries.computeLineDistances();
        scene.add(constellationBoundaries);

        const starsMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShader(),
            fragmentShader: fragmentShader(),
            transparent: true
        });

        starsGeometry = new THREE.BufferGeometry();
        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
        starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 4))
        starsGeometry.setAttribute('size', new THREE.Float32BufferAttribute(starSizes, 1))
        stars = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(stars);

        const targetGeometry = new THREE.RingGeometry(0.5, 0.6, 32);
        const targetMaterial = new THREE.MeshBasicMaterial({color: 0x00ff00, side: THREE.DoubleSide});
        target = new THREE.Mesh(targetGeometry, targetMaterial);
        camera.add(target);
        target.position.set(0, 0, -50);
    }

    const calculateSize = visMag => (minMag - visMag) / (minMag - maxMag) * (MAX_SIZE - MIN_SIZE) + MIN_SIZE;

    const parseRA = ra => {
        const regex = /(\d{1,2})h* (\d{1,2})m*h* (\d{1,2}.*\d{1,2}) *s*m*/;
        const values = ra.match(regex);
        return 15 * parseInt(values[1]) + 15 * parseInt(values[2]) / 60 + 15 * parseFloat(values[3]) / 3600;
    }

    const parseDEC = dec => {
        const regex = /(\+*\-*)(\d{1,2})°* * *(\d{1,2})′* * *(\d{1,2}.*\d{1,2}) *″*°*/;
        const values = dec.match(regex);
        const absDec = parseInt(values[2]) + parseInt(values[3]) / 60 + parseFloat(values[4]) / 3600;
        return values[1] === "-" ? 90 + absDec : 90 - absDec;
    }

    const transformCoords = (ra, dec, dist) => {
        const theta = parseRA(ra) * Math.PI / 180;
        const phi = parseDEC(dec) * Math.PI / 180;
        
        return new THREE.Vector3().setFromSphericalCoords(dist * DISTANCE_MULTIPLIER, phi, theta);
    }

    const formatNumer = number => number.toLocaleString(undefined, {minimumIntegerDigits: 2});
    const formatDecimal = number => number.toLocaleString(undefined, {minimumIntegerDigits: 2, minimumFractionDigits: 2, maximumFractionDigits: 2});

    const transformToRADEC = (vector) => {
        const spherical = new THREE.Spherical().setFromCartesianCoords(vector.x, vector.y, vector.z);
        
        const degTheta = spherical.theta / Math.PI * 180;        
        const raHourDecimals = degTheta > 0 ? degTheta / 15 : degTheta / 15 + 24;
        const raHour = Math.floor(raHourDecimals);
        const raMinsDecimals = (raHourDecimals - raHour) * 60;
        const raMins = Math.floor(raMinsDecimals);
        const raSecs = Math.round(((raMinsDecimals - raMins) * 60 + Number.EPSILON) * 100) / 100;
        
        const degPhi = 90 - (spherical.phi / Math.PI * 180);
        const decDeg = Math.floor(degPhi);
        const decMinDecimals = (degPhi - decDeg) * 60;
        const decMin = Math.floor(decMinDecimals);
        const decSec = Math.round(((decMinDecimals - decMin) * 60 + Number.EPSILON) * 100) / 100;

        return [`${formatNumer(raHour)}h ${formatNumer(raMins)}m ${formatDecimal(raSecs)}s`, `${formatNumer(decDeg)}° ${formatNumer(decMin)}' ${formatDecimal(decSec)}"`];
    }

    const animate = () => {
        requestAnimationFrame(animate);

        const time = performance.now();

        if(controls.isLocked === true) {

            const delta = (time - prevTime) / 1000;

            velocity.x -= velocity.x * 10.0 * delta;
            // velocity.y -= 9.8 * 100.0 * delta; // 100.0 = mass
            velocity.z -= velocity.z * 10.0 * delta;

            direction.x = Number(moveRight) - Number(moveLeft);
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.normalize(); // this ensures consistent movements in all directions

            if(moveForward || moveBackward) {
                velocity.z -= direction.z * 400.0 * delta;
            }
            if(moveLeft || moveRight) {
                velocity.x -= direction.x * 400.0 * delta;
            }

            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);

            const [raText, decText] = transformToRADEC(controls.getDirection(pointing));
            raSpan.textContent = raText;
            decSpan.textContent = decText;
        }

        if(isMoving) {
            let stillMoving = false;
            let offset = 0;
            let linesOffset = 0;
            const starPointsPositions = starsGeometry.attributes.position.array;
            const linesPointsPositions = constellationLinesGeometry.attributes.position.array;              
            for(let c = 0; c < constellations.length; c++) {    
                for(let i = 0; i < constellations[c].stars.length; i++) {
                    const star = catalogue[constellations[c].stars[i]];
                    if(showFixedStars) {
                        if(star.currentDist !== FIXED_DISTANCE) {
                            stillMoving = true;
                            const newDist = star.currentDist > FIXED_DISTANCE ? Math.max(FIXED_DISTANCE, star.currentDist - STAR_SPEED) : Math.min(FIXED_DISTANCE, star.currentDist + STAR_SPEED);
                            star.currentDist = newDist;
                            const newPos = transformCoords(star.ra, star.dec, newDist);
                            star.currentPosition = newPos;
                            starPointsPositions[offset + 0] = newPos.x;
                            starPointsPositions[offset + 1] = newPos.y;
                            starPointsPositions[offset + 2] = newPos.z;
                        }
                    } else {
                        if(star.currentDist !== star.dist) {
                            stillMoving = true;
                            const newDist = star.currentDist > star.dist ? Math.max(star.dist, star.currentDist - STAR_SPEED) : Math.min(star.dist, star.currentDist + STAR_SPEED);
                            star.currentDist = newDist;
                            const newPos = transformCoords(star.ra, star.dec, newDist);
                            star.currentPosition = newPos;
                            starPointsPositions[offset + 0] = newPos.x;
                            starPointsPositions[offset + 1] = newPos.y;
                            starPointsPositions[offset + 2] = newPos.z;
                        }
                    }
                    offset += 3;
                }
                for(let i = 0; i < constellations[c].stars.length; i++) {
                    const star = catalogue[constellations[c].stars[i]];
                    if(star.connectsTo) {
                        for(let j = 0; j < star.connectsTo.length; j++) {
                            const dest = catalogue[star.connectsTo[j]];
                            // if(dest) {
                            linesPointsPositions[linesOffset + 0] = star.currentPosition.x;
                            linesPointsPositions[linesOffset + 1] = star.currentPosition.y;
                            linesPointsPositions[linesOffset + 2] = star.currentPosition.z;
                            linesPointsPositions[linesOffset + 3] = dest.currentPosition.x;
                            linesPointsPositions[linesOffset + 4] = dest.currentPosition.y;
                            linesPointsPositions[linesOffset + 5] = dest.currentPosition.z;
                            linesOffset += 6;
                            // }
                        }
                    }
                }
            }
            starsGeometry.attributes.position.needsUpdate = true;
            constellationLinesGeometry.attributes.position.needsUpdate = true;
            if(!stillMoving) {
                isMoving = false;
            }
        }

        prevTime = time;

        renderer.render(scene, camera);
    }

    const onKeyDown = event => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    const onKeyUp = event => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    const onKeyPress = event => {
        switch(event.code) {
            case 'KeyB':
                constellationBoundaries.visible = !constellationBoundaries.visible;
                break;
            case 'KeyC':
                constellationLines.visible = !constellationLines.visible;
                break;
            case 'KeyM':
                showFixedStars = !showFixedStars;
                if(!isMoving) {
                    isMoving = true;
                }
                break;
            case 'KeyR':
                controls.getObject().position.x = 0;
                controls.getObject().position.y = 0;
                controls.getObject().position.z = 0;
                break;
        }
    }

    const onWindowResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    init();
}
