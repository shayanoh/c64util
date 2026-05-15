declare module 'blessed' {
    interface BlessedOptions {
        smartCSR?: boolean;
        fullUnicode?: boolean;
        dockBorders?: boolean;
    }

    interface ElementOptions {
        parent?: Element;
        top?: string | number;
        left?: string | number;
        width?: string | number;
        height?: string | number;
        bottom?: string | number;
        right?: string | number;
        border?: { type: string };
        style?: Record<string, any>;
        tags?: boolean;
        content?: string;
        label?: string;
        clickable?: boolean;
        mouse?: boolean;
        keys?: boolean;
        focused?: boolean;
        shrink?: boolean;
        scrollable?: boolean;
        alwaysScroll?: boolean;
        scrollbar?: Record<string, any>;
    }

    interface BorderOptions {
        type: string;
    }

    interface StyleOptions {
        border?: { fg?: string; bg?: string };
        bar?: { fg?: string; bg?: string };
        focus?: Record<string, any>;
        hover?: Record<string, any>;
    }

    interface ProgressBarOptions extends ElementOptions {
        filled?: any;
        orientation?: string;
        barBgColor?: string;
        barFgColor?: string;
    }

    class Element {
        constructor(options: ElementOptions);
        on(event: string, callback: (...args: any[]) => void): void;
        key(
            keys: string | string[],
            callback: (ch: any, key: any) => void
        ): void;
        focus(): void;
        blur(): void;
        setContent(content: string): void;
        getContent(): string;
        render(): void;
        destroy(): void;
        free(): void;
        append(element: Element): void;
        insert(element: Element, i?: number): void;
        remove(element: Element): void;
    }

    class Screen extends Element {
        constructor(options: BlessedOptions);
        key(
            keys: string | string[],
            callback: (ch: any, key: any) => void
        ): void;
        render(): void;
        destroy(): void;
        alloc(): void;
        on(event: string, callback: (...args: any[]) => void): void;
    }

    class Box extends Element {}
    class Text extends Element {}
    class Line extends Element {}
    class ScrollableText extends Element {}
    class BigText extends Element {}
    interface ListOptions extends ElementOptions {
        items?: string[];
        selected?: number;
        bold?: boolean;
        vi?: boolean;
    }

    class List extends Element {
        constructor(options: ListOptions);
        add(item: string | string[]): void;
        select(index: number): void;
        selected: number;
        getItem(index: number): string;
        clearItems(): void;
        setItems(items: string[]): void;
    }
    class ListTable extends Element {}
    class Listbar extends Element {}
    class Form extends Element {}
    class Input extends Element {}
    class Textbox extends Element {}
    class Textarea extends Element {}
    class Button extends Element {}
    class Checkbox extends Element {}
    class RadioSet extends Element {}
    class RadioButton extends Element {}
    class FileInput extends Element {}
    class ColorPicker extends Element {}
    class ProgressBar extends Element {
        constructor(options: ProgressBarOptions);
        setProgress(progress: number): void;
        pollProgress(): void;
    }
    class Gauge extends Element {}
    class Log extends Element {}
    class Table extends Element {}
    class Tree extends Element {}
    class TreeTable extends Element {}
    class Markup extends Element {}
    class Terminal extends Element {}
    class Helpers {
        static mergeAttributes(current: any, newAttr: any): any;
        static attrToBinary(current: any, newAttr: any): any;
        static styleTags(text: string): string;
        static parseTags(text: string): string;
        static dropUnicode(text: string): string;
    }

    interface BlessedExports {
        widget: {
            'box': typeof Box;
            'text': typeof Text;
            'line': typeof Line;
            'scrollabletext': typeof ScrollableText;
            'bigtext': typeof BigText;
            'list': typeof List;
            'listtable': typeof ListTable;
            'listbar': typeof Listbar;
            'form': typeof Form;
            'input': typeof Input;
            'textbox': typeof Textbox;
            'textarea': typeof Textarea;
            'button': typeof Button;
            'checkbox': typeof Checkbox;
            'radioset': typeof RadioSet;
            'radiobutton': typeof RadioButton;
            'fileinput': typeof FileInput;
            'colorpicker': typeof ColorPicker;
            'progress-bar': typeof ProgressBar;
            'gauge': typeof Gauge;
            'log': typeof Log;
            'table': typeof Table;
            'tree': typeof Tree;
            'treetable': typeof TreeTable;
            'markup': typeof Markup;
            'terminal': typeof Terminal;
        };
        screen: (options: BlessedOptions) => Screen;
        helpers: typeof Helpers;
        terminal(options: BlessedOptions): Screen;
        screen(options: BlessedOptions): Screen;
        box(options: ElementOptions): Box;
        text(options: ElementOptions): Text;
        line(options: ElementOptions): Line;
        scrollabletext(options: ElementOptions): ScrollableText;
        bigtext(options: ElementOptions): BigText;
        list(options: ListOptions): List;
        listtable(options: ElementOptions): ListTable;
        listbar(options: ElementOptions): Listbar;
        form(options: ElementOptions): Form;
        input(options: ElementOptions): Input;
        textbox(options: ElementOptions): Textbox;
        textarea(options: ElementOptions): Textarea;
        button(options: ElementOptions): Button;
        checkbox(options: ElementOptions): Checkbox;
        radioset(options: ElementOptions): RadioSet;
        radiobutton(options: ElementOptions): RadioButton;
        fileinput(options: ElementOptions): FileInput;
        colorpicker(options: ElementOptions): ColorPicker;
        ProgressBar(options: ProgressBarOptions): ProgressBar;
        gauge(options: ElementOptions): Gauge;
        log(options: ElementOptions): Log;
        table(options: ElementOptions): Table;
        tree(options: ElementOptions): Tree;
        treetable(options: ElementOptions): TreeTable;
        markup(options: ElementOptions): Markup;
    }

    const blessed: BlessedExports;
    export default blessed;
}
