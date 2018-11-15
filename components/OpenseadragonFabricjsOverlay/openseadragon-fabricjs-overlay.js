// OpenSeadragon canvas Overlay plugin 0.0.1 based on svg overlay plugin

(function() {
  if (!window.OpenSeadragon) {
    console.error("[openseadragon-canvas-overlay] requires OpenSeadragon");
    return;
  }

  /**
   * @param {Object} options
   *      Allows configurable properties to be entirely specified by passing
   *      an options object to the constructor.
   * @param {Number} options.scale
   *      Fabric 'virtual' canvas size, for creating objects
   **/
  OpenSeadragon.Viewer.prototype.fabricjsOverlay = function(options) {
    this._fabricjsOverlayInfo = new Overlay(this);
    this._fabricjsOverlayInfo._scale = options.scale || 1000;
    this._fabricjsOverlayInfo._annotator = options.annotator;
    return this._fabricjsOverlayInfo;
  };

  // ----------
  const Overlay = function(viewer) {
    this.fillmode = false
    this._viewer = viewer;

    this._containerWidth = 0;
    this._containerHeight = 0;

    this._canvasdiv = document.createElement("div");
    this._canvasdiv.style.position = "absolute";
    this._canvasdiv.style.left = 0;
    this._canvasdiv.style.top = 0;
    this._canvasdiv.style.width = "100%";
    this._canvasdiv.style.height = "100%";
    this._viewer.canvas.appendChild(this._canvasdiv);

    this._canvas = document.createElement("canvas");
  
    // this._id='osd-overlaycanvas-'+counter();
    this._id = "fabric";
    this._canvas.setAttribute("id", this._id);
    this._canvasdiv.appendChild(this._canvas);
    // this.resize();
    this._fabricCanvas = new fabric.Canvas(this._canvas);
    // this._fabricCanvas.on('after:render', function() {
    //   this._fabricCanvas.contextContainer.strokeStyle = '#555';
  
    //   this._fabricCanvas.forEachObject(function(obj) {
    //     if (obj.data && obj.data.type === 'pointHandle') { return }
    //     var bound = obj.getBoundingRect();
  
    //     this._fabricCanvas.contextContainer.strokeRect(
    //       bound.left + 0.5,
    //       bound.top + 0.5,
    //       bound.width,
    //       bound.height
    //     );
    //   }.bind(this))
    // }.bind(this));

    // disable fabric selection because default click is tracked by OSD
    this._fabricCanvas.selection = false;

    this.activeLine = null;
    this.activeShape = null;
    this.pointArray = [];
    this.lineArray = [];

    this._viewer.addHandler("update-viewport", function() {
      this.resize();
      this.resizecanvas();
    }.bind(this));

    this._viewer.addHandler("open", function() {
      this.resize();
      this.resizecanvas();
    }.bind(this));

    this._fabricCanvas.on('mouse:down', this._mouseDown.bind(this))
    this._fabricCanvas.on('mouse:up', this._mouseUp.bind(this))
    this._fabricCanvas.on('mouse:move', this._mouseMove.bind(this))
    // this._fabricCanvas.on('object:selected', this._objectMove.bind(this))

  };

  // ----------
  Overlay.prototype = {
    modes: ['rectangle', 'circle', 'polygon', 'remove', 'select'],
    defaultStyle: {
      stroke: 'blue',
      strokeWidth: 2,
      fill: 'transparent',
      opacity: 0.4,
      hasBorders: true,
      hasControls: false,
      lockScalingX: true,
      lockScalingY: true,
      lockUniScaling: true,
      lockSkewingX: true,
      lockSkewingY: true,
      lockRotation: true,
      hasControls: false
    },
    pointStyle: {
      radius: 5,
      fill: '#ffffff',
      stroke: '#333333',
      strokeWidth: 0.5,
      selectable: false,
      hasBorders: false,
      hasControls: false,
      originX: 'center',
      originY: 'center',
      objectCaching: false
    },
    lineStyle: {
      strokeWidth: 1,
      fill: '#449',
      stroke: '#449',
      class:'line',
      originX:'center',
      originY:'center',
      selectable: false,
      hasBorders: false,
      hasControls: false,
      evented: false,
      objectCaching:false
    },
    // ----------
    canvas: function() {
      return this._canvas;
    },
    fabricCanvas: function() {
      return this._fabricCanvas;
    },
    // ----------
    clear: function() {
      this._fabricCanvas.clear();
    },
    // ----------
    resize: function() {
      if (this._containerWidth !== this._viewer.container.clientWidth) {
        this._containerWidth = this._viewer.container.clientWidth;
      }

      if (this._containerHeight !== this._viewer.container.clientHeight) {
        this._containerHeight = this._viewer.container.clientHeight;
        this._canvasdiv.setAttribute("height", this._containerHeight);
        this._canvas.setAttribute("height", this._containerHeight);
      }
    },
    getZoom: function () {
      const viewportZoom = this._viewer.viewport.getZoom(true);
      return (this._viewer.viewport._containerInnerSize.x * viewportZoom) / this._scale;
    },
    resizecanvas: function() {
      const origin = new OpenSeadragon.Point(0, 0);
      this._fabricCanvas.setWidth(this._containerWidth);
      this._fabricCanvas.setHeight(this._containerHeight);
      const viewportZoom = this._viewer.viewport.getZoom(true);
      const zoom =
        (this._viewer.viewport._containerInnerSize.x * viewportZoom) /
        this._scale;
      this._fabricCanvas.setZoom(zoom);
      const viewportWindowPoint = this._viewer.viewport.viewportToWindowCoordinates(origin);
      const x = Math.round(viewportWindowPoint.x);
      const y = Math.round(viewportWindowPoint.y);
      const canvasOffset = this._canvasdiv.getBoundingClientRect();

      const pageScroll = OpenSeadragon.getPageScroll();

      this._fabricCanvas.absolutePan(
        new fabric.Point(
          canvasOffset.left - x + pageScroll.x,
          canvasOffset.top - y + pageScroll.y
        )
      );
    },
    captureEvent: function (options) {
      return (options.target || this.modes.indexOf(this._annotator.mode) >= 0)
    },
    highlight: function (idOrElement) {
      let object = (typeof idOrElement === 'string') ? this.getObjectById(idOrElement) : idOrElement
      if (!object) {
        return console.error('nothing found to highlight')
      }
      this._highlight(object)
    },
    _highlight: function (object) {
      if (object === this.activeShape) { return console.log('same same but different') }
      this.deselect()
      object.set({stroke: 'tomato'})
      console.log('highlight', object)
      this.activeShape = object
      this._fabricCanvas.setActiveObject(object)
      // if (object.type === 'polygon') { object.hasControls = false }
      this._notifyShapeSelected(object)
      this._fabricCanvas.renderAll()
    },
    markPoints: function (object) {
      this._fabricCanvas.calcOffset()
      if (object.type !== 'polygon') { return }

      const offset = object.pathOffset
      const center = object.getCenterPoint();
      const ps = object.get('points')
      // const t = object.calcTransformMatrix() 
      // const centerPoint = this._addPoint(center, {
      //   data: { type: 'pointHandle'},
      //   fill: 'pink'
      // })
      // this._fabricCanvas.add(centerPoint);

 
      console.log('center', center)
      console.log('offset', offset)
      const newCenter = { x: center.x - offset.x, y: center.y - offset.y }
      console.log('newCenter', newCenter)
      
      // sometimes points are relative to center and sometimes not
      this.pointArray = ps
        // .map(point => fabric.util.transformPoint(point, t, false))
        // .map(point => { console.log('1', point); return point})
        .map(point => ({ x: newCenter.x + point.x, y: newCenter.y + point.y }))
        // .map(point => { console.log('2', point); return point})
        .map((point,index) => {
          return this._addPoint(point, {
            selectable: true,
            data: { type: 'pointHandle', index: index }
          })
        });
      
      this.pointArray.forEach(c => {
        this._fabricCanvas.add(c)
      })
      this._fabricCanvas.renderAll()

      object.sendBackwards()

      this.pointArray.forEach(c => {
        c.bringToFront()
        c.on('mousedown', options => this._setState(options))
        c.on('moving', options => this._objectMove(options))
        c.on('mouseup', options => this._resetState(options))
      })
 
      this._fabricCanvas.renderAll()

      console.log('pointArray', this.pointArray);
    },
    deselect: function () {
      console.log('DESELECT')
      if (this.activeShape) { 
        this.activeShape.set({
          stroke: this.defaultStyle.stroke,
          selectable: true,
          evented: true,
          lockMovementX: false,
          lockMovementY: false
        })        
      }
      this.reset()
    },
    getObjectById: function (id) {
      const result = this._fabricCanvas.getObjects().filter(function (o) {
        return o.id && o.id === id
      })
      return result[0];
    },
    reset: function () {
      console.log('RESET')
      this.activeShape = null;
      this.activeLine = null;
      this.pointArray.forEach(point => this._fabricCanvas.remove(point))
      this.pointArray = [];
      this.lineArray.forEach(line => this._fabricCanvas.remove(line));
      this.lineArray = [];
      this._fabricCanvas.discardActiveObject();
      this._fabricCanvas.renderAll();
    },
    remove: function () {
      const ao = this._fabricCanvas.getActiveObject()
      this._fabricCanvas.remove(ao);
      this._fabricCanvas.renderAll();
      this._canvas.dispatchEvent(new CustomEvent('shape-deleted', {
        composed: true, bubbles: true, 
        detail: this.serializeObject(ao)}));
    },
    serialize: function () {
      console.log('all objects ', this._fabricCanvas.getObjects());
      console.log('_logShapes canvas ', this._fabricCanvas.toJSON('data'));
      return this._fabricCanvas.toJSON(['id','data'])
    },
    serializeObject: function (object) {
      console.log('serialize', object)
      return {
        shape: {
          id: object.id,
          svg: object.toSVG(d => d)
        }
      }
    },
    load: function (json) {
      this._fabricCanvas.loadFromJSON(json)
    },
    addShapes: function (shapes) {
      shapes.forEach(shape => {
        console.log('shhh... APE!', shape)

        fabric.loadSVGFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${shape}</svg>`, 
          objects => {
            console.log('loadedfromSVGString', objects)
            
            objects.map(o => {
              o.set(Object.assign({}, this.defaultStyle))
              this._fabricCanvas.add(o)
            })
          }
        )
      })
    },

    switchFillMode: function() {
      this.fillmode = !this.fillmode
      const color = this.fillmode ? 'blue' : 'transparent'
      this._fabricCanvas.forEachObject(object => {
        if (this._isPointHandle(object)) { return }
        object.set({
          opacity: 0.4,
          fill: color
        })
      });
      this._fabricCanvas.renderAll()
    },
    //TODO
    _isPointHandle (object) {
      return (object && object.data && object.data.type === 'pointHandle')
    },
    editActiveShape: function () {
      if (!this.activeShape) { return console.warn('Switch to edit mode without active object') }
      // extra caution not to have a mixup with canvas.activeObject
      this._fabricCanvas.discardActiveObject()
      this.markPoints(this.activeShape)
      this.activeShape.set({
        lockMovementX: true,
        lockMovementY: true, 
        objectCaching: false,
        selectable: false,
        hasBorders: false,
        hasControls: false,
        evented: false
      })

    },
    reimport: function (object) {
      let newObject
      fabric.loadSVGFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${object.toSVG(d => d)}</svg>`, 
        objects => {
          newObject = objects[0]
          newObject.set(Object.assign({}, this.defaultStyle, {
            fill: this.fillmode ? 'blue': 'transparent'
          }))
        }
      )
      return newObject
    },

    _mouseDown: function(options) {
      const mode = this._annotator.mode
      const pointer = this._fabricCanvas.getPointer(options.originalEvent);

      switch (mode) {
        case 'edit':
          // pointhandle selection    
          if (this._isPointHandle(options.target)) { 
            console.log('point', options.target)
            this.currentPointHandle = options.target
            this.pointArray.forEach(point => point.set({ fill: 'white' }))
            options.target.set({ fill: 'tomato' })
            this._fabricCanvas.renderAll()
            break
          }
          // clicking anywhere but on a point handle will end the edit mode
          // this.deselect()
          this._annotator.mode = 'select'
          break
        case 'select':
          if (options.target) {
            this._highlight(options.target); break 
          }
          this.deselect()
          break
        case "rectangle":
          const rect = new fabric.Rect(Object.assign({}, this.defaultStyle, {
            left: pointer.x,
            top: pointer.y
          }));

          this._fabricCanvas.add(rect);
          this.activeShape = rect;
          this._fabricCanvas.setActiveObject(rect);
          this._fabricCanvas.renderAll();
          break
        case "circle":
          // TODO improve circle painting
          const circle = new fabric.Circle(Object.assign({}, this.defaultStyle, {
            left: pointer.x,
            top: pointer.y,
            selectionBackgroundColor: "transparent"
          }));

          this._fabricCanvas.add(circle);
          this.activeShape = circle;
          this._fabricCanvas.setActiveObject(circle);
          this._fabricCanvas.renderAll();
          break
        case "polygon":
          // if the target id is the same as the first one created
          if (options.target && this.pointArray.length && options.target.id === this.pointArray[0].id) {
            const polygon = this._generatePolygon();
            this._fabricCanvas.add(polygon);
            this._highlight(polygon);
            this._notifyShapeCreated(polygon)
            this._annotator.mode = 'select'
            break;
          }
          this.addPointFromEvent(options);
          break
        // default:
        //   console.warn('_mouseUp called with unknown mode', options);
      }
      return options
    },

    _setState(options) {
      console.log('_setState', options.pointer)
      const pointer = this._fabricCanvas.getPointer(options.originalEvent);
      this._clickOrigin = pointer
      this._state = this.activeShape.get('points')
      console.log('_state', this._state)
    },
    _objectMove: function(options) {
      if (!this._isPointHandle(options.target)) { return }
      const pointer = this._fabricCanvas.getPointer(options.originalEvent);

      const dx = pointer.x - this._clickOrigin.x
      const dy = pointer.y - this._clickOrigin.y
      console.log('moving point handle', dx, dy)
      const i = options.target.data.index
      const points = this._state.concat([])
      const point = points[i]
      const newPoint = {
        x: point.x + dx,
        y: point.y + dy
      }
      console.log('old coords', point)
      console.log('new coords', newPoint)
      console.log('old points', points)
      points.splice(i, 1, newPoint)
      console.log('new points', points)
      this.activeShape.set({ points: points });
      this.activeShape.setCoords();
      this._fabricCanvas.renderAll()
    },
    _resetState: function (options) {
      const clone = this.reimport(this.activeShape)
      this._fabricCanvas.remove(this.activeShape)
      this.activeShape = clone
      console.log('_nextState', this.activeShape)
      this._fabricCanvas.renderAll()
      this._fabricCanvas.add(clone)
      this._fabricCanvas.renderAll()
    },
    _mouseMove: function(options) {
      const mode = this._annotator.mode

      if (!(this.activeShape || this.activeLine)) { return }

      const pointer = this._fabricCanvas.getPointer(options.originalEvent);
      switch (mode) {
        case "rectangle":
          this.activeShape.set("width", pointer.x - this.activeShape.get("left"));
          this.activeShape.set("height", pointer.y - this.activeShape.get("top"));
          this.activeShape.setCoords()
          this._fabricCanvas.renderAll();
          break
        case "circle":
          this.activeShape.set("radius", Math.abs(pointer.x - this.activeShape.get("left")));
          this._fabricCanvas.renderAll();
          break
        case "polygon":
          if (!this.activeLine || this.activeLine.class != "line") { break }

          this.activeLine.set({ x2: pointer.x, y2: pointer.y });
          let points = this.activeShape.get("points");
          // set last point of shape to current position
          points[this.pointArray.length] = { x: pointer.x, y: pointer.y };
          this.activeShape.set({ points: points });
          this.activeShape.setCoords()
          this._fabricCanvas.renderAll();
          break
        //   console.warn('_mouseMove called with unknown mode', options);
      }
    },

    _mouseUp: function(options) {
      const mode = this._annotator.mode;

      switch(mode) {
        case 'edit':
          console.warn('_mouseUp do nottin ');
          break
        case 'rectangle':
          const rect = this.activeShape
          const center = this.activeShape.getCenterPoint()
          const points = [
            { x: rect.left, y: rect.top },
            { x: rect.left + rect.width, y: rect.top },
            { x: rect.left + rect.width, y: rect.top + rect.height },
            { x: rect.left, y: rect.top + rect.height }
          ]
                   
          this._fabricCanvas.discardActiveObject()
          this._fabricCanvas.remove(this.activeShape)
          this._fabricCanvas.renderAll()

          const poly = new fabric.Polygon(points, Object.assign({}, this.defaultStyle))
          const reimport = this.reimport(poly)
          reimport.id = this._getShapeId()
          this._fabricCanvas.add(reimport)
          // poly.setCoords()
          // this.activeShape = reimport
          this._annotator.mode = 'select'
          this._highlight(reimport)
          this._notifyShapeCreated(reimport)
          break
        case 'circle':
          // circle is special
          this.activeShape.set("hasBorders", true);
          this.activeShape.set("hasControls", true);
          this.activeShape.setCoords();
          this.activeShape.id = this._getShapeId()
          this._highlight(this.activeShape)
          this._notifyShapeCreated(this.activeShape)
          this._annotator.mode = 'select'
        break;
        case 'select':
          // no activeShape on mouse up means nothing was or is selected
          if (!this.activeShape) { break }
          this._notifyShapeChanged(this.activeShape)
          break
        default:
          // console.warn('_mouseUp called with unknown mode', options);
      }
      if (!this.activeShape) { return }
      this.activeShape.set({ fill: this.fillmode ? 'blue' : 'transparent' })
    },
    addPointFromEvent: function (options) {
      const pointer = this._fabricCanvas.getPointer(options.originalEvent);
      // first point marker is special
      const attributes = this.pointArray.length === 0 ? { fill: 'tomato' } : null
      const circle = this._addPoint(pointer, attributes)
      this.pointArray.push(circle);

      // start a new line with length zero
      const newLinePoints = [
        pointer.x, pointer.y,
        pointer.x, pointer.y,
      ];
      this.line = new fabric.Line(newLinePoints, this.lineStyle);
      this.lineArray.push(this.line);

      // draw new intermediate polygon
      const activeShape = this.activeShape
      const polyPoints = activeShape ? activeShape.get('points') : []

      polyPoints.push({ x: pointer.x, y: pointer.y })
      const polygon = new fabric.Polygon(polyPoints, {
        stroke:'#336',
        strokeWidth: 2,
        fill: '#aaf',
        opacity: 0.3,
        selectable: false,
        hasBorders: false,
        hasControls: false,
        evented: false,
        objectCaching: false
      });

      // render changes to fabric canvas
      if (activeShape) {
        this._fabricCanvas.discardActiveObject()
        this._fabricCanvas.remove(activeShape);
      }
      this._fabricCanvas.renderAll()

      this._fabricCanvas.add(polygon);
      polygon.setCoords()
      this._fabricCanvas.add(this.line);
      this._fabricCanvas.add(circle);
      this._fabricCanvas.setActiveObject(polygon);

      // set inner overlay state
      this.activeShape = polygon;
      this.activeLine = this.line;
    },

    _addPoint: function (pointer, attributes) {
      // new point marker
      return new fabric.Circle(Object.assign({}, this.pointStyle, {
          left: pointer.x,
          top: pointer.y,
          id: 'p-' + Date.now() + Math.floor(Math.random() * 11)
      }, attributes));
    },

    _generatePolygon: function () {
      const points = this.activeShape.get('points')
      // the last point that was needs to be removed
      const pointsMinusLast = points.slice(0, points.length-1)

      //cleanup
      this._fabricCanvas.remove(this.activeShape).remove(this.activeLine);
      this._fabricCanvas.renderAll()

      // reset
      this.pointArray.forEach(point => this._fabricCanvas.remove(point));
      this.pointArray = [];
      this.lineArray.forEach(line => this._fabricCanvas.remove(line));
      this.lineArray = [];
      this.line = null;
      this.activeLine = null;

      console.log('numer of points', pointsMinusLast.length)
      const polygon = new fabric.Polygon(pointsMinusLast, this.defaultStyle);
      polygon.id = this._getShapeId()
      return this.reimport(polygon)
    },

    _notifyShapeCreated: function (object) {
      const detail = this.serializeObject(object)
      const event = new CustomEvent('shape-created', {composed:true, bubbles: true, detail: detail})
      this._canvas.dispatchEvent(event);
    },

    _notifyShapeChanged: function (object) {
      if (!object) { return }
      const detail = this.serializeObject(object)
      const event = new CustomEvent('shape-changed', {composed: true, bubbles: true, detail: detail})
      this._canvas.dispatchEvent(event);
    },

    _notifyShapeSelected: function (object) {
      if (!object) { return }
      const detail = this.serializeObject(object)
      // const event = new CustomEvent('shape-selected', {composed: true, bubbles: true, detail: detail})
      // this._canvas.dispatchEvent(event);
    },

    _getShapeId () {
      return 's-' + Date.now() + Math.floor(Math.random() * 11)
    }
  };
})();
