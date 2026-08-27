const citoImgError = (elm, product_id) => {
    elm = $(elm);
    let parent = elm.parent(),
        f = false;
    parent.html('<span class="ty-ajax-loading-box inline"></span>');
    $.ajax({
        type: 'POST',
        url: fn_url('cito.image?is_ajax=1'),
        data: {
            product_id: product_id
        },
        global: false,//prevent the global handlers like ajaxStop
        async: true,//default is true
        //dataType: 'json',
        cache: true,
        success: (data, res) => {
            f = true;
            if(data.src) {
                parent.html('<img src="'+data.src+'">');//todo: on error .. nginx cache..
            } else {
                parent.replaceWith('<span class="ty-no-image"><i class="ty-no-image__icon ty-icon-image"></i></span>');
            }
        },
        complete: () => {
            if(!f)
                parent.replaceWith('<span class="ty-no-image"><i class="ty-no-image__icon ty-icon-image"></i></span>');
        }
    });
}

((_, $) => {
    
    let val = '',
        oval = '',
        t1,t2,
        citoDiv,citoLeft,citoRight,
        ajax,
        curSearchInput,
        searchInputs = [],
        targets = [],
        lastSearches = [],
        dragDistance = 0,
        isMobile = window.innerWidth < 768;

    const createLastSearches = () => {
        citoLeft.css('width', '100%').show();
        let citoSearches = $('<div id="cito_last_searches"></div>').prependTo(citoLeft);
        citoSearches.append(`<p>${_.tr('cito.last_searches')}</p>`);
        let results = '';
        lastSearches.map((s) => results += `<a class="cito-category cito-result">${s}</a>`);
        citoSearches.append('<div class="cito-content">'+results+'</div>');
        $('.cito-category', citoSearches).on('click', function() {
            textToSearch($(this).text().trim());
        });
        _rebuildTabs();
    }

    const textToSearch = (val) => {
        if (curSearchInput) {
            curSearchInput.val(val).trigger('keyup');
            queueMicrotask(() => {
                curSearchInput.focus();
            });
        }
    }

    const citoClose = () => {
        if(citoDiv) {
            citoDiv.removeClass('cito-over');
            citoDiv.hide();
            curSearchInput.blur();
        }
        if($('#cito_over_mobile').length) {
            let _form = $('.cito-searching-form').removeClass('cito-searching-form');
            _form.prependTo(_form.data('oParent'));
            $('body').removeClass('cito-searching-body');
            $('#cito_over_mobile').remove();
            $('#cito_searching').remove();
            $('#off_dropdown_sticky_item_search').click();
        }
    }

    const showResults = (val, correctedVal, noCorrections) => {

        if(ajax) ajax.abort();
        if(t1) clearTimeout(t1);
        if(t2) clearTimeout(t2);

        if(val.length < 2) {
            if (val.length == 0 && citoParams.show_last_searches && lastSearches.length) {
                citoLeft.empty().hide();
                citoRight.empty().hide();

                createLastSearches.call(curSearchInput);

                citoDiv.css('display', 'flex');
            } else {
                citoDiv.hide();
            }
            return;
        }

        $('#cito_correction', citoLeft).remove();
        
        t1 = setTimeout(() => {
            ajax = $.ajax({
                type: 'POST',
                url: citoParams.url,
                data: {
                    q: val,
                    storefront_id: citoParams.storefront_id,
                    lang_code: citoParams.lang_code,
                    currency_code: citoParams.currency_code,
                    weights: citoParams.weights,
                    show_top_categories: citoParams.show_top_categories,
                    show_zero_price: citoParams.show_zero_price,
                    usergroup_ids: citoParams.usergroup_ids,
                    token: citoParams.token
                },
                global: false,//prevent the global handlers like ajaxStop
                async: true,//default is true
                dataType: 'json',
                cache: true,
                complete: (xhr, textStatus) => {
                    if(xhr.readyState != 4) return;
                    let data = '';
                    if(xhr.responseJSON) {
                        data = xhr.responseJSON;
                    } else {
                        data = JSON.parse(xhr.responseText);
                    }
                    if(!data) {
                        console.log('error in json res', xhr);
                        return;
                    }
                    if(citoParams.dev_mode && data.notifications) {
                        $.each(data.notifications, (type, messages) => {
                            $.each(messages, (k, message) => {
                                if(type == 'D') type = 'N';
                                $.ceNotification('show', {
                                    title: _.tr('notice'),
                                    message: message,
                                    type: type
                                });
                            });
                        });
                    }
                    citoLeft.empty().hide();
                    citoRight.empty().hide();
                    if(data.code != 200) {
                        if(data.text) {
                            $.ceNotification('show', {
                                title: data.code,
                                message: data.text,
                                type: 'E'
                            });
                        }
                        return;
                    }
                    citoDiv.css('display', 'flex');
                    data.total = data.total ? Number(data.total) : 0;

                    if (citoParams.show_last_searches) {
                        $('#cito_last_searches').remove();
                    }

                    if (citoParams.show_other_users_searched) {
                        queueMicrotask(() => {
                            $.ajax({
                                type: 'POST',
                                url: fn_url('cito.q_suggestions?is_ajax=1'),
                                data: {
                                    q: val
                                },
                                global: false,//prevent the global handlers like ajaxStop
                                async: true,//default is true
                                //dataType: 'json',
                                cache: true,
                                complete: (xhr, textStatus) => {
                                    if(xhr.readyState != 4) return;
                                    $('#cito_suggestions').remove();
                                    let res;
                                    if(xhr.responseJSON) {
                                        res = xhr.responseJSON;
                                    } else {
                                        res = JSON.parse(xhr.responseText);
                                    }
                                    if(!res) {
                                        console.log('error in json res', xhr);
                                        return;
                                    }
                                    if(res.notifications) {
                                        $.ceNotification('showMany', res.notifications);
                                        delete res.notifications;
                                    }
                                    if (res.suggestions.length) {
                                        citoLeft.show();
                                        let citoSuggestions = $('<div id="cito_suggestions"></div>');
                                        citoSuggestions.prependTo(citoLeft);
                                        citoSuggestions.append(`<p>${_.tr('cito.other_users_searched')}</p>`);
                                        let results = '';
                                        res.suggestions.map((s) => results += `<a class="cito-suggestion cito-result"><i class="ty-icon ty-icon-search"></i> ${s}</a>`);
                                        citoSuggestions.append('<div class="cito-content">'+results+'</div>');
                                        $('.cito-suggestion', citoSuggestions).on('click', function() {
                                            textToSearch($(this).text().trim());
                                        });
                                        _rebuildTabs();
                                    }
                                }
                            });
                        });
                    }

                    $('#cito_top_categories').remove();
                    if (citoParams.show_top_categories && data.total) {
                        let prCategories = {};
                        $.each(data.items, (k, item) => {
                            if (item.category_id > 0) {
                                if (!prCategories[item.category_id]) {
                                    prCategories[item.category_id] = {
                                        'category_id': item.category_id,
                                        'name': item.category,
                                        'items': 0,
                                    };
                                }
                                prCategories[item.category_id]['items']++;
                            }
                        });
                        if(data.top_categories) {
                            $.each(data.top_categories, (k, item) => {
                                prCategories[item.category_id] = {
                                    'category_id': item.category_id,
                                    'name': item.category,
                                    'items': -1,
                                };
                            });
                        }
                        if (!$.isEmptyObject(prCategories)) {
                            prCategories = Object.values(prCategories);
                            prCategories = prCategories.sort( (a, b) => {
                                if(b.items == -1) return Infinity;
                                return b.items - a.items;
                            }).slice(0, 5);
                            citoLeft.show();
                            let citoTopCategories = $('<div id="cito_top_categories"></div>').appendTo(citoLeft);
                            citoTopCategories.append(`<p>${_.tr('cito.top_categories')}</p>`);
                            let results = '';
                            prCategories.map((item) => results += '<a href="' + fn_url('categories.view?category_id='+item.category_id)+'" class="cito-result">'+item.name+'</a>');
                            citoTopCategories.append('<div class="cito-content">'+results+'</div>');
                            _rebuildTabs();
                        }
                    }

                    if(citoLeft.is(':visible')) {
                        citoLeft.css('width', '');
                        citoRight.css('width', '');
                    } else {
                        citoRight.css('width', '100%');
                    }
                    citoRight.show();
                    citoRight.append(`<p class="active">${_.tr('products')}</p>`);
                    let citoCorrection = $('<div id="cito_correction"></div>').appendTo(citoRight).hide();
                    if(data.total) {
                        let results = '';
                        $.each(data.items, (k, item) => {
                            results += '<a href="'+fn_url('products.view?product_id='+item.product_id)+'" class="cito-result">\
                                '+(item.image ? '<span><img src="'+item.image+'" onerror="citoImgError(this, '+item.product_id+')"></span>' : '<span class="ty-no-image"><i class="ty-no-image__icon ty-icon-image"></i></span>')+'\
                                <span class="cito-desc">\
                                    <small>'+item.category+'</small>\
                                    <span>'+item.name+(item.brand ? ' ('+item.brand+')' : '')+'</span>\
                                    '+(citoParams.show_sku && item.product_code ? '<span class="sku ut2--sku-text">'+item.product_code+'</span>' : '')+'\
                                    '+(item.display_price ? '<span class="ty-price-num">'+item.display_price+'</span>' : '')+'\
                                </span>\
                                '+(item.stats ? '<span class="cito-stats">'+item.stats+'</span>' : '')+'\
                            </a>';
                        });
                        citoRight.append('<div class="cito-content">'+results+'</div>');
                        _rebuildTabs();
                    }
                    citoRight.append('<div id="cito_total"'+(data.total ? '' : ' class="no-results"')+'>'+_.tr('cito.total')+': '+(data.total ? '<a href="'+fn_url('products.search?search_performed=Y&q='+val)+'">'+data.total+' '+_.tr('cito.results')+'</a>' : _.tr('cito.no_results'))+'</div>');

                    if (citoParams.show_correction) {
                        if(correctedVal && !noCorrections) {
                            $('<span>'
                                +_.tr('cito.text_corrected')
                                    .replace('[new_value]', '<a class="cito-to-search-correction new-val">'+val+'</a>')
                                    .replace('[old_value]', '<a class="cito-to-search-correction">'+correctedVal+'</a>')
                            +'&nbsp; </span>').appendTo(citoCorrection);
                            citoCorrection.show();
                            $('.cito-to-search-correction', citoCorrection).click(function() {
                                let _this = $(this);
                                if(_this.hasClass('new-val')) {
                                    textToSearch(_this.text());
                                } else {
                                    showResults(_this.text(), false, true);
                                }
                            });
                        }
                        queueMicrotask(() => {
                            $.ajax({
                                type: 'POST',
                                url: citoParams.show_correction_url,
                                data: {
                                    q: val,
                                    q_results: data.total,
                                    storefront_id: citoParams.storefront_id,
                                    get_all: citoParams.dev_mode || '',
                                    lang_code: citoParams.lang_code,
                                    token: citoParams.token
                                },
                                global: false,
                                dataType: 'json',
                                cache: true,
                                complete: (xhr, textStatus) => {
                                    if (xhr.readyState != 4) return;
                                    let correctionData;
                                    if (xhr.responseJSON) {
                                        correctionData = xhr.responseJSON;
                                    } else {
                                        correctionData = JSON.parse(xhr.responseText);
                                    }
                                    if(citoParams.dev_mode && !correctionData) {
                                        $.ceNotification('show', {
                                            title: _.tr('notice'),
                                            message: xhr.responseText,
                                            type: 'N'
                                        });
                                        return;
                                        // schon
                                        // battrien
                                    }
                                    if(citoParams.dev_mode && correctionData.notifications) {
                                        $.each(correctionData.notifications, (type, messages) => {
                                            $.each(messages, (k, message) => {
                                                if(type == 'D') type = 'N';
                                                $.ceNotification('show', {
                                                    title: _.tr('notice'),
                                                    message: message.replace('<pre style="', '<pre style="max-height:90vh;overflow-y:auto;'),
                                                    type: type
                                                });
                                            });
                                        });
                                        delete correctionData.notifications;
                                    }
                                    // console.log(correctionData.correct_q, correctionData.correct_count, data.total);
                                    if (!data.total && correctionData.correct_q && correctionData.correct_count && !noCorrections) {
                                        showResults(correctionData.correct_q, val);
                                    } else if(correctionData.combos) {
                                        let links = '';
                                        $.each(correctionData.combos, (q, num) => {
                                            links += '<a class="cito-combo">'+q+'</a>';
                                        });
                                        if(links.length) {
                                            $('<span>'
                                                +_.tr('cito.did_you_mean')
                                                    .replace('[value]', '<div>'+links+'</div>')
                                            +'</span>').appendTo(citoCorrection);
                                            citoCorrection.show();
                                            $('.cito-combo', citoCorrection).click(function() {
                                                textToSearch($(this).text());
                                            });
                                        }
                                    }
                                    if(citoParams.dev_mode && correctionData.suggests && location.hash == '#cito_debug') {
                                        citoCorrection.show();
                                        citoCorrection.append('<div>DEBUG INFO:</div>');
                                        $.each(correctionData.suggests, (w, _data) => {
                                            let t = '<table class="ty-table"><tr><td>suggest for '+w+'</td><td>distance</td><td>docs</td><td>results</td><tr>';
                                            $.each(_data, (k, v) => {
                                                t += '<tr><td>'+v.suggest+'</td><td>'+v.distance+'</td><td>'+v.docs+'</td><td>'+v.results+'</td><tr>';
                                            });
                                            t += '</table>';
                                            citoCorrection.append(t);
                                        });
                                    }
                                }
                            })
                        });
                    }
                    t2 = setTimeout(() => {
                        lastSearches.unshift(val);
                        lastSearches = lastSearches.filter((el, index, arr) => {
                            return index === arr.indexOf(el);
                        });
                        if (navigator.sendBeacon) {
                            let fd = new FormData();
                            fd.append('q', val);
                            fd.append('num_results', data.total);
                            navigator.sendBeacon(fn_url('cito.q'), fd);
                        } else {
                            $.ajax({
                                type: 'POST',
                                url: fn_url('cito.q'),
                                data: {
                                    q: val,
                                    num_results: data.total
                                },
                                global: false,//prevent the global handlers like ajaxStop
                                async: true,//default is true
                                //dataType: 'json',
                                cache: false
                            });
                        }
                    }, 2000);
                },
            });
        }, 50);

    }

    const _rebuildTabs = () => {
        if(!isMobile) return;
        $('#cito_tabs').remove();
        let citoTabs = $('<div id="cito_tabs"></div>').prependTo(citoDiv);
        $('p', citoDiv).sort(function(a, b) {
            return $(b).hasClass('active') - $(a).hasClass('active');
        }).each(function() {
            let _this = $(this);
            $('<a>'+_this.text()+'</a>').appendTo(citoTabs).on('click', function() {
                $('a', citoTabs).removeClass('active');
                $(this).addClass('active');
                $('.cito-content').hide();
                $('.cito-content', _this.parent()).show();
            });
        });
        $('a:first', citoTabs).click();
    }

    const _resize = (isInit) => {
        if(!isInit && !citoDiv.is(':visible')) return;
        isMobile = window.innerWidth < 768;
        if(!isMobile) {
            if(!citoDiv.data('desktop_initiated')) {
                citoDiv.data('desktop_initiated', 1);
                citoDiv.on('mouseenter', function() {
                    $(this).addClass('cito-over');
                }).on('mouseleave', function() {
                    $(this).removeClass('cito-over');
                });
            }
            if(citoDiv.is(':visible')) {
                let rect = citoDiv[0].getBoundingClientRect();
                // const scaleFactor = window.devicePixelRatio || 1;
                let diff = window.innerWidth - rect.left - rect.width;
                if(diff < 17) {
                    citoDiv.css('left', (diff-27)+'px');
                } else {
                    citoDiv.css('left', '');
                }
            }

            if($('#cito_over_mobile').length) {
                citoDiv.removeClass('cito-over');
                let _form = $('.cito-searching-form').removeClass('cito-searching-form');
                _form.prependTo(_form.data('oParent'));
                $('body').removeClass('cito-searching-body');
                $('#cito_over_mobile').remove();
                $('#cito_searching').remove();
                $('#cito_tabs').remove();
                $('.cito-content').show();
                queueMicrotask(() => {
                    curSearchInput.focus();
                });
            }
        } else {
            citoDiv.css('left', '');
            if(citoDiv.data('desktop_initiated')) {
                citoDiv.data('desktop_initiated', '');
                citoDiv.off('mouseenter').off('mouseleave');
            }
            if(!$('#cito_over_mobile').length) {
                citoDiv.addClass('cito-over');
                let citoMobileWrap = $('<div>')
                $('<div id="cito_searching"><div id="cito_searching_top"><div id="cito_searching_close"><div></div></div></div></div>').prependTo('body');
                let _form = curSearchInput.closest('form').addClass('cito-searching-form'),
                    _parent = _form.parent();
                _form.appendTo('#cito_searching_top').data('oParent', _parent);
                $('#cito_searching_close').on('click', () => {
                    citoClose();
                });
                $('#cito_searching_top').append('<div id="cito_searching_but"'+(curSearchInput.val().length ? ' class="cito-delete"' : '')+'><div></div></div>');
                $('#cito_searching_but').on('click', function() {
                    if($(this).hasClass('cito-delete')) {
                        curSearchInput.val('').trigger('keyup').focus();
                    } else {
                        //no action
                    }
                });
                $('body').addClass('cito-searching-body');
                $('<div id="cito_over_mobile"></div>').prependTo('body');
                _rebuildTabs();
                queueMicrotask(() => {
                    curSearchInput.focus();
                });
            }
            if(!citoDiv.data('mobile_initiated') && citoParams.dev_mode) {
                citoDiv.data('mobile_initiated', '1');
            }
        }
    }

    function _init(onlyInit) {
        curSearchInput = $(this);
        if(!citoDiv) {
            citoDiv = $('<div id="cito"></div>');
            curSearchInput.before(citoDiv);
            citoLeft = $('<div id="cito_left"></div>').appendTo(citoDiv);
            let isDragging = false;
            let startY, scrollTop;
            citoRight = $('<div id="cito_right"></div>').appendTo(citoDiv).on('mousedown', (e) => {
                isDragging = true;
                startY = e.pageY - citoRight[0].offsetTop;
                scrollTop = citoRight[0].scrollTop;
                citoRight[0].style.cursor = 'grabbing';
                dragDistance = 0; // Reset drag distance
                e.preventDefault();
            }).on('mousemove', (e) => {
                if (!isDragging) return;
                const y = e.pageY - citoRight[0].offsetTop;
                const walk = (y - startY) * 2; // Adjust scroll speed
                citoRight[0].scrollTop = scrollTop - walk;
                dragDistance += Math.abs(y - startY); // Track movement
            }).on('click', (e) => {
                if (dragDistance > 5) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
            $(document).on('mouseup', (e) => {
                if(isDragging) {
                    isDragging = false;
                    citoRight[0].style.cursor = '';
                    setTimeout(() => { //queueMicrotask will be triggered before click
                        dragDistance = 0;
                    }, 0);
                }
            });
            _resize(true);
        } else if(!onlyInit) {
            _resize(true);
        }
    }

    $.ceEvent('on', 'ce.commoninit', (context) => {
        if(context[0] !== document) return;
        lastSearches = citoParams.last_searches || [];
        searchInputs = $('#search_input,form[name="search_form"] input[name="hint_q"],form[name="search_form"] input[name="q"]', context).filter(function() {
            let _this = $(this);
            if(_this.closest('.ty-product-filters').length) return false;
            if(_this.val() == _this.attr('title')) {
                _this.val('');
            }
            if(_this.hasClass('cm-hint')) {
                _this.removeClass('cm-hint');
                _this.prop('name', _this.prop('name').str_replace('hint_', ''));
                _this.unbind('click');
                _this.unbind('focus');
                _this.unbind('focusin');
                _this.unbind('blur');
                _this.unbind('focusout');
            }
            return true;
        }).attr('autocomplete', 'off').attr('autocorrect', 'off').attr('autocapitalize', 'none').attr('spellcheck', 'false').removeClass('cm-hint').on('keyup cut paste drop', function() {
            _init.apply(this, [true]);
            val = curSearchInput.val().trim();

            if(isMobile) {
                $('#cito_searching_but').toggleClass('cito-delete', !!val.length);
            }

            if(val == oval) return;
            oval = val;

            showResults(val);

        }).on('focus', function() {
            _init.call(this);

            let len = curSearchInput.val().trim().length;
            if(len > 1) {
                citoDiv.css('display', 'flex');
            } else {
                if (!len && citoParams.show_last_searches && lastSearches.length) {
                    citoLeft.empty().hide();
                    citoRight.empty().hide();

                    createLastSearches.call(curSearchInput);

                    citoDiv.css('display', 'flex');
                }
            }
        }).on('keydown', (e) => {
            if(e.which == 27) {
                citoClose();
                return;
            }
            if(!(e.which == 40 || e.which == 38 || e.which == 13)) return;
            let els = $('a.cito-result', citoDiv),
                c = els.length;
            if(!c) return;
            if(e.which == 40 || e.which == 38) {
                let cur = -1,
                    next;
                els.each((index, el) => {
                    if($(el).hasClass('currentSel')) {
                        cur = index;
                        return false;
                    }
                });
                if(cur != -1) {
                    els.eq(cur).removeClass('currentSel');
                }
                if(e.which == 40) {//down
                    cur++;
                    if(cur == c) cur = 0;
                    next = els.eq(cur);
                } else if(e.which == 38) {//up
                    cur--;
                    if(cur < 0) cur = c-1;
                    next = els.eq(cur);
                }
                if(next) {
                    let scrollElm = isMobile ? citoDiv : citoRight;
                    next.addClass('currentSel');
                    let scroll = scrollElm.scrollTop();
                    if(cur == 0) {
                        if(scroll != 0) {
                            scroll = 0;
                            scrollElm.scrollTop(scroll);
                        }
                    } else {
                        let top = next.position().top;
                        let c = e.which == 38 ? next.height()*1.5 : 0;
                        if(top < c) {
                            scroll += top-c;
                            if(scroll < 0) scroll = 0;
                            scrollElm.scrollTop(scroll);
                        }
                        let bot = top+next.height()*2.5-scrollElm.height();
                        if(bot > 0) {
                            scroll += bot;
                            if(scroll > scrollElm[0].scrollHeight) scroll = scrollElm[0].scrollHeight;
                            scrollElm.scrollTop(scroll);
                        }

                    }
                }
            } else if(e.which == 13) {//enter
                let currentSel = els.filter('.currentSel');
                if(currentSel.length == 1) {
                    currentSel.click();
                    e.preventDefault();
                    e.stopPropagation();
                } else {
                    let f = curSearchInput.closest('form');
                    if(f.length) {
                        f.submit();
                    } else {
                        $('#cito_total > a').click();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        });
        
        if(searchInputs.length && citoParams.searchPhrases && citoParams.searchPhrases.length) {
            $.getScript('js/addons/nl_cito/theater.min.js', () => {
                let theater = theaterJS();
                theater.addActor('searchInput', {accuracy: 0.6, speed: 0.8}, (displayValue) => {
                    searchInputs.attr('placeholder', displayValue);
                });
                $.each(citoParams.searchPhrases, function() {
                    theater.addScene('searchInput:'+this, 1800);
                });
                theater.addScene(theater.replay);
            });
        }
                
        $(document).on('click', (e) => {
            if($(e.target).closest(searchInputs).length || (citoDiv && citoDiv.hasClass('cito-over')) || dragDistance > 5) return;//cito-over is for when other click event is js triggered (like cm-combination)
            citoClose();
        });
    });

    let tr;
    $(window).on('resize', () => {
        if(!citoDiv || !citoDiv.is(':visible')) return;
        if(tr) clearTimeout(tr);
        tr = setTimeout(() => _resize(), 50);
    });

})(Tygh, Tygh.$);
