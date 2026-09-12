// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import ProfilePreviewWindow from './ProfilePreviewWindow';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps a pop-out preview synchronized with editor changes without publishing',()=>{
 const doc=document.implementation.createHTMLDocument();const close=vi.fn();
 vi.spyOn(window,'open').mockReturnValue({document:doc,closed:false,focus:vi.fn(),close,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as Window);
 const view=render(<ProfilePreviewWindow><h1>First draft</h1></ProfilePreviewWindow>);fireEvent.click(screen.getByRole('button',{name:'Open live preview ↗'}));expect(doc.body.textContent).toContain('First draft');
 view.rerender(<ProfilePreviewWindow><h1>Updated draft</h1></ProfilePreviewWindow>);expect(doc.body.textContent).toContain('Updated draft');expect(doc.body.textContent).not.toContain('First draft');view.unmount();expect(close).toHaveBeenCalled();
});
it('explains a blocked pop-up',()=>{vi.spyOn(window,'open').mockReturnValue(null);render(<ProfilePreviewWindow>Preview</ProfilePreviewWindow>);fireEvent.click(screen.getByRole('button',{name:'Open live preview ↗'}));expect(screen.getByRole('alert').textContent).toContain('blocked');});
