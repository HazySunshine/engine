/*
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

/**
 * @category ui
 */

import { InstanceMaterialType, UIRenderComponent } from '../../core/components/ui-base/ui-render-component';
import { ccclass, executionOrder, menu, property } from '../../core/data/class-decorator';
import { clamp, Color, Mat4, Vec2, Vec3 } from '../../core/math';
import { view } from '../../core/platform';
import visibleRect from '../../core/platform/visible-rect';
import { UI } from '../../core/renderer/ui/ui';
import { Node } from '../../core/scene-graph';
import { ccenum } from '../../core/value-types/enum';
import { GraphicsComponent } from './graphics-component';
import { TransformBit } from '../../core/scene-graph/node-enum';

const _worldMatrix = new Mat4();
const _vec2_temp = new Vec2();
const _mat4_temp = new Mat4();

const _circlepoints: Vec3[] = [];
function _calculateCircle (center: Vec3, radius: Vec3, segements: number) {
    _circlepoints.length = 0;
    const anglePerStep = Math.PI * 2 / segements;
    for (let step = 0; step < segements; ++step) {
        _circlepoints.push(new Vec3(radius.x * Math.cos(anglePerStep * step) + center.x,
            radius.y * Math.sin(anglePerStep * step) + center.y, 0));
    }

    return _circlepoints;
}
/**
 * @zh 遮罩组件类型。
 */
export enum MaskType {
    /**
     * @zh
     * 使用矩形作为遮罩。
     */
    RECT = 0,

    /**
     * @zh
     * 使用椭圆作为遮罩。
     */
    ELLIPSE = 1,

    /**
     * @zh
     * 使用图像模版作为遮罩。
     */
    GRAPHICS_STENCIL = 2,
}

ccenum(MaskType);

const SEGEMENTS_MIN = 3;
const SEGEMENTS_MAX = 10000;

/**
 * @zh
 * 遮罩组件。
 * 可通过 cc.MaskComponent 获得该组件。
 */
@ccclass('cc.MaskComponent')
@executionOrder(110)
@menu('UI/Render/Mask')
export class MaskComponent extends UIRenderComponent {
    /**
     * @zh
     * 遮罩类型。
     */
    @property({
        type: MaskType,
        displayOrder: 4,
        tooltip: '遮罩类型',
    })
    get type () {
        return this._type;
    }

    set type (value: MaskType) {
        if (this._type === value) {
            return;
        }

        this._type = value;
        this._updateGraphics();
        if (this._renderData) {
            this.destroyRenderData();
            this._renderData = null;
        }
    }


    /**
     * @zh
     * Alpha 阈值（不支持 Canvas 模式）<br/>
     * 只有当模板的像素的 alpha 大于 alphaThreshold 时，才会绘制内容。<br/>
     * 该数值 0 ~ 1 之间的浮点数，默认值为 0（因此禁用 alpha 测试）<br/>
     * 当被设置为 1 时，会丢弃所有蒙版像素，所以不会显示任何内容，在之前的版本中，设置为 1 等同于 0，这种效果其实是不正确的。<br/>
     */
    // @property({
    //     slide: true,
    //     range: [0, 1, 0.1],
    // })
    // get alphaThreshold () {
    //     return this._alphaThreshold;
    // }

    // set alphaThreshold (value) {
    //     this._alphaThreshold = value;
    // }

    /**
     * @zh
     * 反向遮罩（不支持 Canvas 模式）。
     */
    // @property()
    // get inverted () {
    //     return this._inverted;
    // }

    // set inverted (value) {
    //     this._inverted = value;
    //     if (cc.game.renderType === cc.game.RENDER_TYPE_CANVAS) {
    //         cc.warnID(4202);
    //         return;
    //     }
    // }

    /**
     * TODO: remove segments, not supported by graphics
     * @zh
     * 椭圆遮罩的曲线细分数。
     */
    @property
    get segments () {
        return this._segments;
    }

    set segments (value) {
        if(this._segments === value){
            return;
        }

        this._segments = clamp(value, SEGEMENTS_MIN, SEGEMENTS_MAX);
        this._updateGraphics();
    }

    get graphics () {
        return this._graphics;
    }

    get clearGraphics () {
        return this._clearGraphics;
    }

    @property({
        visible: false,
        override: true,
    })
    get dstBlendFactor () {
        return this._dstBlendFactor;
    }

    set dstBlendFactor (value) {
        if (this._dstBlendFactor === value) {
            return;
        }

        this._dstBlendFactor = value;
        this._updateBlendFunc();
    }

    @property({
        visible: false,
        override: true,
    })
    get srcBlendFactor () {
        return this._srcBlendFactor;
    }

    set srcBlendFactor (value) {
        if (this._srcBlendFactor === value) {
            return;
        }

        this._srcBlendFactor = value;
        this._updateBlendFunc();
    }

    @property({
        visible: false,
        override: true,
    })
    // @constget
    get color (): Readonly<Color> {
        return this._color;
    }

    set color (value) {
        if (this._color === value) {
            return;
        }

        this._color.set(value);
        this.markForUpdateRenderData();
    }

    public static Type = MaskType;

    @property
    protected _type = MaskType.RECT;

    // @property
    // private _alphaThreshold = 0;

    // @property
    // private _inverted = false;

    @property
    protected _segments = 64;

    protected _graphics: GraphicsComponent | null = null;
    protected _clearGraphics: GraphicsComponent | null = null;

    constructor () {
        super();
        this._instanceMaterialType = InstanceMaterialType.ADDCOLOR;
    }

    public onLoad () {
        this._createGraphics();
        if (this._clearGraphics) {
            this._clearGraphics.onLoad();
        }

        if (this._graphics) {
            this._graphics.onLoad();
        }
    }

    /**
     * @zh
     * 图形内容重塑。
     */
    public onRestore () {
        this._createGraphics();
        this._updateGraphics();
    }

    public onEnable () {
        super.onEnable();
        this._enableGraphics();

        view.on('design-resolution-changed', this._updateClearGraphics, this);
    }

    public onDisable () {
        super.onDisable();
        this._disableGraphics();
        view.off('design-resolution-changed', this._updateClearGraphics);
    }

    public onDestroy () {
        super.onDestroy();
        this._removeGraphics();
    }

    /**
     * @zh
     * 根据屏幕坐标计算点击事件。
     *
     * @param cameraPt  屏幕点转换到相机坐标系下的点。
     */
    public isHit (cameraPt: Vec2) {
        const node = this.node;
        const size = node.getContentSize();
        const w = size.width;
        const h = size.height;
        const testPt = _vec2_temp;

        this.node.getWorldMatrix(_worldMatrix);
        Mat4.invert(_mat4_temp, _worldMatrix);
        Vec2.transformMat4(testPt, cameraPt, _mat4_temp);
        const ap = node.getAnchorPoint();
        testPt.x += ap.x * w;
        testPt.y += ap.y * h;

        let result = false;
        if (this.type === MaskType.RECT /*|| this.type === MaskType.IMAGE_STENCIL*/) {
            result = testPt.x >= 0 && testPt.y >= 0 && testPt.x <= w && testPt.y <= h;
        }
        else if (this.type === MaskType.ELLIPSE) {
            const rx = w / 2;
            const ry = h / 2;
            const px = testPt.x - 0.5 * w;
            const py = testPt.y - 0.5 * h;
            result = px * px / (rx * rx) + py * py / (ry * ry) < 1;
        }
        // if (this.inverted) {
        //     result = !result;
        // }
        return result;
    }

    protected _render (render: UI) {
        render.commitComp(this, null, this._assembler!);
    }

    protected _postRender (render: UI) {
        if (!this._postAssembler) {
            return;
        }

        render.commitComp(this, null, this._postAssembler!);
    }

    protected _nodeStateChange (type: TransformBit) {
        super._nodeStateChange(type);

        this._updateGraphics();
    }

    protected _resolutionChanged () {
        this._updateClearGraphics();
    }

    protected _canRender () {
        if (!super._canRender()) {
            return false;
        }

        return this._clearGraphics !== null && this._graphics !== null;
    }

    protected _flushAssembler () {
        const assembler = MaskComponent.Assembler!.getAssembler(this);
        const posAssembler = MaskComponent.PostAssembler!.getAssembler(this);

        if (this._assembler !== assembler) {
            this.destroyRenderData();
            this._assembler = assembler;
        }

        if (this._postAssembler !== posAssembler) {
            this._postAssembler = posAssembler;
        }

        if (!this._renderData) {
            if (this._assembler && this._assembler.createData) {
                this._renderData = this._assembler.createData(this);
                this._renderData!.material = this.sharedMaterial;
                this.markForUpdateRenderData();
            }
        }
    }

    private _createGraphics () {
        if (!this._clearGraphics) {
            const node = new Node('clear-graphics');
            const clearGraphics = this._clearGraphics = node.addComponent(GraphicsComponent)!;
            clearGraphics.delegateSrc = this.node;
            clearGraphics.helpInstanceMaterial();
            clearGraphics.lineWidth = 0;
            const color = Color.WHITE.clone();
            color.a = 0;
            clearGraphics.fillColor = color;
        }

        if (!this._graphics) {
            const graphics = this._graphics = new GraphicsComponent();
            graphics.node = this.node;
            graphics.node.getWorldMatrix();
            graphics.helpInstanceMaterial();
            graphics.lineWidth = 0;
            const color = Color.WHITE.clone();
            color.a = 0;
            graphics.fillColor = color;
        }
    }

    private _updateClearGraphics () {
        if (!this._clearGraphics) {
            return;
        }

        const size = visibleRect;
        this._clearGraphics.node.setWorldPosition(size.width / 2, size.height / 2, 0);
        this._clearGraphics.clear();
        this._clearGraphics.rect(-size.width / 2, -size.height / 2, size.width, size.height);
        this._clearGraphics.fill();
    }

    private _updateGraphics () {
        if (!this._graphics) {
            return;
        }

        const node = this.node;
        const graphics = this._graphics;
        // Share render data with graphics content
        graphics.clear();
        const size = node.getContentSize();
        const width = size.width;
        const height = size.height;
        const ap = node.getAnchorPoint();
        const x = -width * ap.x;
        const y = -height * ap.y;
        if (this._type === MaskType.RECT) {
            graphics.rect(x, y, width, height);
        } else if (this._type === MaskType.ELLIPSE) {
            const center = new Vec3(x + width / 2, y + height / 2, 0);
            const radius = new Vec3(width / 2, height / 2, 0,
            );
            const points = _calculateCircle(center, radius, this._segments);
            for (let i = 0; i < points.length; ++i) {
                const point = points[i];
                if (i === 0) {
                    graphics.moveTo(point.x, point.y);
                } else {
                    graphics.lineTo(point.x, point.y);
                }
            }
            graphics.close();
        }

        graphics.fill();
    }

    private _enableGraphics() {
        if (this._clearGraphics) {
            this._clearGraphics.onEnable();
            this._updateClearGraphics();
        }

        if (this._graphics) {
            this._graphics.onEnable();
            this._updateGraphics();
        }
    }

    private _disableGraphics () {
        if (this._graphics) {
            this._graphics.onDisable();
        }

        if (this._clearGraphics) {
            this._clearGraphics.onDisable();
        }
    }

    private _removeGraphics () {
        if (this._graphics) {
            this._graphics.destroy();
        }

        if (this._clearGraphics) {
            this._clearGraphics.destroy();
        }
    }
}

// tslint:disable-next-line
cc.MaskComponent = MaskComponent;